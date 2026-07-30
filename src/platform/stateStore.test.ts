import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@/core/schema';
import { createWriterLane } from '@/core/writer-lane';
import {
  commitMigration,
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
    { id: 'p1', name: 'Legacy', color: '#2563eb', shortLabel: 'LG', active: true,
      modifications: [{ kind: 'request-header', id: 'm1', name: 'Authorization', value: 'Bearer dev',
        enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }] },
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
    expect(kv.state).toMatchObject({ schemaVersion: SCHEMA_VERSION, profiles: [{ modifications: [{ id: 'm1' }] }] });
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
      runtime: { sendMessage: async () => { throw new Error(message); } },
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
      runtime: { sendMessage: async () => { throw 'raw string rejection'; } },
    };
    expect(await sendCommand({ type: 'toggle-pause' })).toMatchObject({
      ok: false,
      error: 'raw string rejection',
    });
  });
});
