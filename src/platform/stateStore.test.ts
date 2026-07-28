import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultState, SCHEMA_VERSION } from '@/core/schema';
import { commitMigration, loadState, persistState, StateLoadError } from '@/platform/stateStore';

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
    expect(await commitMigration()).toBe(true);
    expect((await loadState()).schemaVersion).toBe(SCHEMA_VERSION);
    // 메모리 변환만이면 다음 로드가 같은 v1을 다시 만난다 — 저장소가 v2로 굳어야 한다.
    expect(kv.state).toMatchObject({ schemaVersion: SCHEMA_VERSION, profiles: [{ modifications: [{ id: 'm1' }] }] });
  });

  it('올릴 수 없는 v1은 default로 접지 않고 오류로 알리며 아무것도 쓰지 않는다', async () => {
    const kv = seedLocal({ ...V1, profiles: [{ id: 'only' }] });
    await expect(loadState()).rejects.toBeInstanceOf(StateLoadError);
    await expect(commitMigration()).rejects.toBeInstanceOf(StateLoadError);
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
    expect(await commitMigration()).toBe(true);
    expect(writes).toBe(1);
    expect(await commitMigration()).toBe(false);
    expect(writes).toBe(1);
  });
});

/*
 * 마이그레이션 커밋이 **더 새 상태를 덮는** 창 (release R2-2).
 *
 * 커맨드 리스너는 마이그레이션보다 먼저 등록되고, 커맨드의 `persistState`는 이 커밋만
 * 지나지 않는다 — 즉 커밋이 v1을 읽은 뒤 쓰기까지 가는 사이에 편집된 v2가 착지할 수
 * 있다. 즉시 resolve하는 `seedLocal`은 그 인터리빙을 **표현할 수 없다**(순차 실행만
 * 돈다). 그래서 `get`의 해결을 지연시키는 변형을 따로 세워 손으로 순서를 짠다 —
 * 어댑터 시임의 본령이다(spec.md Testing Decisions, 2026-07-28 개정).
 */
function seedDeferredLocal(state: unknown) {
  const kv: Record<string, unknown> = { state: structuredClone(state) };
  writes = 0;
  let holdNextGet = false;
  let release = () => {};
  const local = {
    get: async () => {
      // **호출 시점의** 값을 집는다 — 실제 storage.local도 나중에 착지한 쓰기를
      // 소급해 보여주지 않는다. 이 스냅샷이 "읽기는 먼저, 전달은 나중"을 만든다.
      const snapshot = { ...kv };
      if (holdNextGet) {
        holdNextGet = false;
        await new Promise<void>((resolve) => void (release = resolve));
      }
      return snapshot;
    },
    set: async (items: Record<string, unknown>) => {
      writes += 1;
      Object.assign(kv, items);
    },
  };
  (globalThis as unknown as { browser: unknown }).browser = { storage: { local } };
  return {
    kv,
    holdNextGet: () => {
      holdNextGet = true;
    },
    release: () => release(),
  };
}

describe('commitMigration — 두 writer 인터리빙 (release R2-2)', () => {
  it('첫 읽기 뒤 착지한 편집본 위에는 굳히지 않고 물러난다 — 편집본이 최종값이다', async () => {
    const store = seedDeferredLocal(V1);

    // 마이그레이션의 첫 읽기를 공중에 띄운다 — v1을 이미 집었지만 아직 전달되지 않았다.
    store.holdNextGet();
    const commit = commitMigration();
    await Promise.resolve();

    // 그 사이 커맨드가 편집된 v2를 착지시킨다 (커맨드 큐는 이 커밋을 지나지 않는다).
    const edited = { ...createDefaultState(), paused: true };
    await persistState(edited);
    expect(store.kv.state).toMatchObject({ schemaVersion: SCHEMA_VERSION, paused: true });

    // 이제 마이그레이션을 푼다.
    store.release();

    // 물러남은 오류가 아니다 — false를 돌려주고 던지지 않는다(‘migration commit failed’ 없음).
    await expect(commit).resolves.toBe(false);
    // 최종 저장값은 편집본 그대로 — v1에서 올라온 스냅샷이 아니다.
    expect(store.kv.state).toMatchObject({ schemaVersion: SCHEMA_VERSION, paused: true });
    expect((store.kv.state as { profiles: unknown[] }).profiles).toEqual(edited.profiles);
    expect(writes).toBe(1); // 커맨드의 쓰기 하나뿐
  });

  it('아무도 끼어들지 않으면 지연되어도 정상적으로 굳힌다', async () => {
    const store = seedDeferredLocal(V1);
    store.holdNextGet();
    const commit = commitMigration();
    await Promise.resolve();
    store.release();
    await expect(commit).resolves.toBe(true);
    expect(store.kv.state).toMatchObject({ schemaVersion: SCHEMA_VERSION });
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
