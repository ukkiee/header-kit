import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@/core/schema';
import { commitMigration, loadState, StateLoadError } from '@/platform/stateStore';

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
