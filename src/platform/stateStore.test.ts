import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultState, SCHEMA_VERSION, type StoredState } from '@/core/schema';
import { acknowledgeRetirement } from '@/core/commands';
import { createWriterLane } from '@/core/writer-lane';
import {
  commitMigration,
  persistState,
  loadState,
  requestBackupMutation,
  sendCommand,
  StateLoadError,
} from '@/platform/stateStore';

/*
 * 두 writer 인터리빙을 보던 `commitMigration — 두 writer 인터리빙` 두 건은 S3
 * (`runtime/service-worker.integration.test.ts`)로 옮겨 갔다 (ADR 0016, D5).
 *
 *   · `첫 읽기 뒤 착지한 편집본 위에는 굳히지 않고 물러난다` (본디 109행)
 *     → S3 `명령이 먼저면 커밋이 "할 일 없음"으로 물러나고 편집이 최종값으로 남는다`
 *   · `아무도 끼어들지 않으면 지연되어도 정상적으로 굳힌다` (본디 133행)
 *     → S3 `마이그레이션이 먼저면 명령이 올라간 상태 위에서 계산된다`
 *
 * 그 둘이 지켜보던 것은 커밋의 compare-and-swap이었고, 그 술어는 레인 아래에서 항상 참이라
 * 걷혔다. 여기 fake는 `get`을 하나만 붙잡을 수 있어 리뷰어가 지목한 순서를 애초에 표현하지
 * 못했다 — S3는 모든 순서를 열거한다. 아래 남는 것은 경합과 무관한 커밋 자체의 계약이다.
 */

/** 커밋은 레인을 지난다 — 증표는 `lane.run` 밖에서 만들 수 없다 (D3). */
const commit = (): Promise<boolean> => createWriterLane().run(commitMigration);

/** 배선 테스트 (R-3) — 순수 분류기가 보지 못하는 storage.local 커밋·무쓰기를 못 박는다. */
const V1 = {
  schemaVersion: 1,
  paused: false,
  profiles: [
    {
      id: 'p1',
      name: 'Legacy',
      color: '#2563eb',
      shortLabel: 'LG',
      active: true,
      modifications: [
        {
          kind: 'request-header',
          id: 'm1',
          name: 'Authorization',
          value: 'Bearer dev',
          enabled: true,
          mode: 'override',
          emptyMeans: 'remove',
          comment: '',
        },
      ],
    },
  ],
  materialized: {},
  customHeaderNames: ['X-Custom'],
};

/** 쓰기 횟수 — "읽기 경로는 쓰지 않는다"는 티켓 14의 불변식은 횟수로만 관측된다. */
let writes = 0;

function seedLocal(state: unknown): Record<string, unknown> {
  const kv: Record<string, unknown> = { state: structuredClone(state) };
  writes = 0;
  const local = {
    get: async () => ({ ...kv }),
    set: async (items: Record<string, unknown>) => {
      writes += 1;
      Object.assign(kv, items);
    },
  };
  (globalThis as unknown as { browser: unknown }).browser = { storage: { local } };
  return kv;
}

afterEach(() => delete (globalThis as unknown as { browser?: unknown }).browser);

describe('commitMigration — v1 마이그레이션 커밋 (storage.local)', () => {
  it('검증을 통과한 v1을 v2로 굳혀 저장하고 규칙을 보존한다', async () => {
    const kv = seedLocal(V1);
    expect(await commit()).toBe(true);
    expect((await loadState()).schemaVersion).toBe(SCHEMA_VERSION);
    // 메모리 변환만이면 다음 로드가 같은 v1을 다시 만난다 — 저장소가 v2로 굳어야 한다.
    expect(kv.state).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      profiles: [{ modifications: [{ id: 'm1' }] }],
    });
  });

  it('올릴 수 없는 v1은 default로 접지 않고 오류로 알리며 아무것도 쓰지 않는다', async () => {
    const kv = seedLocal({ ...V1, profiles: [{ id: 'only' }] });
    await expect(loadState()).rejects.toBeInstanceOf(StateLoadError);
    await expect(commit()).rejects.toBeInstanceOf(StateLoadError);
    expect(kv.state).toEqual({ ...V1, profiles: [{ id: 'only' }] });
    expect(writes).toBe(0);
  });

  /*
   * 두 번째 호출은 쓰지 않는다 — 커밋은 재조정 바깥에서 돌지만, SW가 깨어날 때마다 돈다.
   * 이미 v2인 저장소에 매번 다시 쓰면 그 쓰기가 onStateChanged를 때려 불필요한 재수렴이
   * 상시로 돌고, 늦게 도착한 쓰기가 더 새 상태를 덮을 창도 그만큼 늘어난다.
   */
  it('v1에 대해 한 번만 쓰고, 이미 v2인 저장소에는 아무것도 쓰지 않는다', async () => {
    seedLocal(V1);
    expect(await commit()).toBe(true);
    expect(writes).toBe(1);
    expect(await commit()).toBe(false);
    expect(writes).toBe(1);
  });
});

/**
 * v2 → v3 커밋 (티켓 01, ADR 0017).
 *
 * 순수 분류기는 "메모리에서 올라갔다"까지만 보인다. 여기서 못 박는 것은 그 결과가 **쓰기 문을
 * 지나 저장소에 굳는가**이다 — 굳지 않으면 SW가 깨어날 때마다 같은 변환이 되풀이되고,
 * 저장된 JSON과 실제 동작이 영원히 어긋난 채로 남는다.
 */
describe('commitMigration — v2 응답 쿠키 재구조화 커밋', () => {
  const V2 = {
    schemaVersion: 2,
    paused: false,
    profiles: [
      {
        id: 'p1',
        name: 'P',
        color: '#2563eb',
        shortLabel: 'P',
        active: true,
        modifications: [
          {
            kind: 'set-cookie',
            id: 'm1',
            value: 'sid=abc; Path=/',
            enabled: true,
            mode: 'override',
            emptyMeans: 'remove',
            comment: '',
          },
        ],
      },
    ],
    materialized: {},
    customHeaderNames: [],
  };

  it('갈라낸 재료가 저장소에 굳는다', async () => {
    const kv = seedLocal(V2);
    expect(await commit()).toBe(true);
    expect(kv.state).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      profiles: [{ modifications: [{ id: 'm1', name: 'sid', value: 'abc', path: '/' }] }],
    });
  });

  it('한 번만 쓴다 — 굳은 뒤 다시 깨어나도 아무것도 쓰지 않는다', async () => {
    seedLocal(V2);
    expect(await commit()).toBe(true);
    expect(writes).toBe(1);
    expect(await commit()).toBe(false);
    expect(writes).toBe(1);
  });

  it('쓰기가 실패하면 저장소는 v2로 남아 다음 기회에 다시 시도된다', async () => {
    const kv = seedLocal(V2);
    const local = (globalThis as unknown as { browser: { storage: { local: { set: unknown } } } }).browser
      .storage.local;
    const failing = local.set;
    local.set = async () => {
      throw new Error('quota');
    };
    await expect(commit()).rejects.toThrow('quota');
    // 반쯤 올라간 상태로 굳지 않았다 — 다음 커밋이 같은 v2를 다시 만나 올린다.
    expect(kv.state).toMatchObject({ schemaVersion: 2 });
    local.set = failing;
    expect(await commit()).toBe(true);
    expect(kv.state).toMatchObject({ schemaVersion: SCHEMA_VERSION });
  });
});

/**
 * 퇴역 공지의 수명 (티켓 02, ADR 0017).
 *
 * 순수 분류기는 "공지가 계산됐다"까지만 보인다. 여기서 못 박는 것은 그 공지가 **저장소에서
 * 얼마나 사는가**이다 — 팝업은 렌더 직후 닫히는 것이 정상 동작이라, 수명이 화면에 매여 있으면
 * 규칙이 이미 넓어진 뒤에 그 이유를 설명하던 유일한 것이 사라진다.
 */
describe('퇴역 공지 — 저장소에서의 수명', () => {
  const V2_RETIRED = {
    schemaVersion: 2,
    paused: false,
    profiles: [
      {
        id: 'p1',
        name: 'P',
        color: '#2563eb',
        shortLabel: 'P',
        active: true,
        modifications: [
          {
            kind: 'request-header',
            id: 'm1',
            name: 'X',
            value: '1',
            enabled: true,
            mode: 'override',
            emptyMeans: 'remove',
            comment: '',
            conditions: { tabDomains: ['tab.io'] },
          },
        ],
      },
    ],
    materialized: {},
    customHeaderNames: [],
  };

  /** 확인도 쓰기 문을 지난다 — 증표는 `lane.run` 밖에서 만들 수 없다 (D3). */
  const acknowledge = (state: StoredState): Promise<void> =>
    createWriterLane().run((permit) => persistState(permit, acknowledgeRetirement(state)));

  /*
   * 넓어진 규칙과 공지가 **한 번의 쓰기로 함께** 굳는다. 둘이 갈라지면 그 사이에 서비스워커가
   * 죽는 것만으로 "규칙은 넓어졌는데 설명은 없는" 상태가 저장소에 남는다 — 그 창을 없애는
   * 유일한 방법은 같은 커밋에 담는 것이다.
   */
  it('넓어진 상태와 공지가 한 커밋에 함께 굳는다', async () => {
    const kv = seedLocal(V2_RETIRED);
    expect(await commit()).toBe(true);
    expect(writes).toBe(1);
    expect(kv.state).toMatchObject({ retirementNotice: { rules: 1 } });
    expect((await loadState()).profiles[0]?.modifications[0]?.conditions).toBeUndefined();
  });

  /*
   * 팝업과 탭이 동시에 열려 있어도 한쪽이 다른 쪽 몫을 소비하지 않는다. 읽기가 부수효과를
   * 갖지 않는 것이 그 보장의 전부라, 여기서는 **쓰기 횟수**로 잰다.
   */
  it('읽는 것으로는 지워지지 않는다 — 두 표면이 각자 읽어도 둘 다 본다', async () => {
    seedLocal(V2_RETIRED);
    await commit();
    const popup = await loadState();
    const tab = await loadState();

    expect(popup.retirementNotice).toEqual({ rules: 1 });
    expect(tab.retirementNotice).toEqual({ rules: 1 });
    expect(writes).toBe(1); // 마이그레이션 커밋 하나뿐 — 읽기는 쓰지 않았다
  });

  /*
   * 서비스워커가 깨어나 커밋을 다시 돌려도 공지가 부풀거나 사라지지 않는다. 이미 v3라
   * 올릴 것이 없으므로 커밋은 물러나고, 공지는 확인될 때까지 저장소에 그대로 남는다.
   */
  it('서비스워커가 재시작해도 남는다 — 다시 세지도, 사라지지도 않는다', async () => {
    seedLocal(V2_RETIRED);
    await commit();
    expect(await commit()).toBe(false);
    expect((await loadState()).retirementNotice).toEqual({ rules: 1 });
  });

  it('확인 쓰기가 실패하면 공지가 저장소에 그대로 남는다', async () => {
    const kv = seedLocal(V2_RETIRED);
    await commit();
    const loaded = await loadState();

    const local = (globalThis as unknown as { browser: { storage: { local: { set: unknown } } } }).browser
      .storage.local;
    const working = local.set;
    local.set = async () => {
      throw new Error('quota');
    };
    await expect(acknowledge(loaded)).rejects.toThrow('quota');
    expect(kv.state).toMatchObject({ retirementNotice: { rules: 1 } });

    // 문이 다시 열리면 같은 확인이 통과하고, 그때 비로소 사라진다.
    local.set = working;
    await acknowledge(loaded);
    expect((await loadState()).retirementNotice).toBeUndefined();
  });
});

/**
 * 쓰기 문은 **읽을 수 없는 것을 쓰지 않는다** (structure r2 S2-1).
 *
 * 지금까지 가드는 반쪽이었다 — "읽을 수 없는 것 **위에** 쓰지 않는다"만 있고 그 대칭이
 * 없었다. 명령 메시지는 캐스팅만 거쳐 들어오므로, 모순된 레코드를 담은 명령 하나가 저장소에
 * 닿으면 다음 로드에서 검증이 실패해 `reset`이 되고 **전 프로필이 기본 상태로 교체**된다.
 * 명령마다 디코더를 붙이는 대신 문 하나에서 막는 이유는 add·update·undo·import·백업 복원이
 * 전부 이 문을 지나기 때문이다.
 */
describe('persistState — 온전하지 않은 상태는 쓰지 않는다', () => {
  const good = () => createDefaultState();

  const withModification = (modification: unknown) => {
    const state = good() as unknown as Record<string, unknown>;
    const profiles = state.profiles as Array<Record<string, unknown>>;
    return {
      ...state,
      profiles: [{ ...profiles[0], modifications: [modification] }],
    } as unknown as ReturnType<typeof createDefaultState>;
  };

  const write = (state: ReturnType<typeof createDefaultState>) =>
    createWriterLane().run((permit) => persistState(permit, state));

  it('온전한 상태는 그대로 쓴다', async () => {
    const kv = seedLocal(good());
    await write(good());
    expect(writes).toBe(1);
    expect(kv.state).toMatchObject({ schemaVersion: SCHEMA_VERSION });
  });

  it('두 표현을 함께 든 응답 쿠키는 거부되고 아무것도 쓰이지 않는다', async () => {
    const kv = seedLocal(good());
    const before = structuredClone(kv.state);
    await expect(
      write(
        withModification({
          kind: 'set-cookie',
          id: 'm1',
          enabled: true,
          mode: 'override',
          emptyMeans: 'remove',
          comment: '',
          name: 'sid',
          value: 'abc',
          raw: 'sid=abc',
        }),
      ),
    ).rejects.toThrow();
    expect(writes).toBe(0);
    expect(kv.state).toEqual(before);
  });

  it('종류를 알 수 없는 규칙도 같은 문에서 막힌다', async () => {
    seedLocal(good());
    await expect(
      write(withModification({ kind: 'quantum', id: 'm1', enabled: true, comment: '' })),
    ).rejects.toThrow();
    expect(writes).toBe(0);
  });

  /*
   * 거부가 정상 편집을 막으면 앱이 통째로 쓰지지 않는 상태가 된다 — 이 가드에서 가장 비싼
   * 실패 방향이라 두 변형을 모두 통과시키는지 명시적으로 본다.
   */
  it('두 변형 다 정상 편집으로 통과한다', async () => {
    for (const modification of [
      {
        kind: 'set-cookie',
        id: 'm1',
        enabled: true,
        mode: 'override',
        emptyMeans: 'remove',
        comment: '',
        name: 'sid',
        value: 'abc',
        path: '/',
      },
      {
        kind: 'set-cookie',
        id: 'm2',
        enabled: true,
        mode: 'append',
        emptyMeans: 'remove',
        comment: '',
        raw: 'sid=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT',
      },
    ]) {
      seedLocal(good());
      await write(withModification(modification));
      expect(writes).toBe(1);
    }
  });
});

/*
 * loadState는 **순수 읽기**다 (티켓 14).
 *
 * 읽는 경로가 쓰면 그 쓰기가 storage.onChanged를 때린다. 재조정의 loadSnapshot이 그 읽기를
 * 쓰므로, 그 쓰기가 촉발한 새 세대가 **자기 자신을 무효화**해 apply(replaceSessionRules)가
 * 통째로 스킵되고 규칙은 저장소 왕복 한 번 뒤에야 걸린다. 스모크가 시드 직후 관측하면
 * "수정이 아직 안 걸린" 상태를 보게 되는 그 경로다.
 */
describe('loadState — 순수 읽기', () => {
  it('v1을 만나도 storage.local.set을 한 번도 부르지 않는다', async () => {
    const kv = seedLocal(V1);
    expect((await loadState()).schemaVersion).toBe(SCHEMA_VERSION);
    expect(writes).toBe(0);
    // 저장소는 손대지 않은 v1 그대로 — 커밋은 commitMigration만 한다.
    expect(kv.state).toMatchObject({ schemaVersion: 1 });
  });
});

describe('전송 거부는 던지지 않고 결과 객체로 돌아온다 (릴리스 r1 R-2)', () => {
  /*
   * 서비스워커가 교체되는 중이면 `sendMessage`는 "Could not establish connection"으로 **던진다**.
   * 화면이 그 거부를 받으면 배너도 재시도 안내도 뜨지 않는다 — 전체 초기화 패널은 확인 상태를
   * await 전에 이미 껐으므로, 확인 버튼만 되돌아오고 사용자는 요청이 시작조차 안 된 것인지
   * 도중에 끊긴 것인지 구분하지 못한다.
   *
   * **두 채널을 한 테스트에서 보는 것이 요점이다.** 티켓 03이 백업 변이 쪽에만 이 계약을
   * 세웠고 전이 명령 쪽은 그대로 두어, 같은 문 둘이 다른 약속을 하고 있었다(릴리스 r1이 그
   * 비대칭을 잡았다). 한쪽만 단언하면 그 비대칭이 다시 벌어져도 green이다.
   */
  const rejectingRuntime = (message: string) => {
    (globalThis as unknown as { browser: unknown }).browser = {
      runtime: {
        sendMessage: async () => {
          throw new Error(message);
        },
      },
    };
  };

  it('전이 명령 — 왕복이 던져도 `{ok:false, error}`로 정착한다', async () => {
    rejectingRuntime('Could not establish connection.');
    const result = await sendCommand({ type: 'toggle-pause' });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining('Could not establish connection') });
  });

  it('백업 변이 — 같은 약속을 한다', async () => {
    rejectingRuntime('Could not establish connection.');
    const result = await requestBackupMutation({ op: 'clear-cloud' });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining('Could not establish connection') });
  });

  it('던진 것이 Error가 아니어도 문자열로 담아 돌려준다', async () => {
    (globalThis as unknown as { browser: unknown }).browser = {
      runtime: {
        sendMessage: async () => {
          throw 'raw string rejection';
        },
      },
    };
    expect(await sendCommand({ type: 'toggle-pause' })).toMatchObject({
      ok: false,
      error: 'raw string rejection',
    });
  });
});
