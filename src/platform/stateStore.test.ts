import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@/core/schema';
import { loadState, StateLoadError } from '@/platform/stateStore';

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

function seedLocal(state: unknown): Record<string, unknown> {
  const kv: Record<string, unknown> = { state: structuredClone(state) };
  const local = {
    get: async () => ({ ...kv }),
    set: async (items: Record<string, unknown>) => void Object.assign(kv, items),
  };
  (globalThis as unknown as { browser: unknown }).browser = { storage: { local } };
  return kv;
}

afterEach(() => delete (globalThis as unknown as { browser?: unknown }).browser);

describe('loadState — v1 마이그레이션 (storage.local)', () => {
  it('검증을 통과한 v1을 v2로 굳혀 저장하고 규칙을 보존한다', async () => {
    const kv = seedLocal(V1);
    expect((await loadState()).schemaVersion).toBe(SCHEMA_VERSION);
    // 메모리 변환만이면 다음 로드가 같은 v1을 다시 만난다 — 저장소가 v2로 굳어야 한다.
    expect(kv.state).toMatchObject({ schemaVersion: SCHEMA_VERSION, profiles: [{ modifications: [{ id: 'm1' }] }] });
  });

  it('올릴 수 없는 v1은 default로 접지 않고 오류로 알리며 아무것도 쓰지 않는다', async () => {
    const kv = seedLocal({ ...V1, profiles: [{ id: 'only' }] });
    await expect(loadState()).rejects.toBeInstanceOf(StateLoadError);
    expect(kv.state).toEqual({ ...V1, profiles: [{ id: 'only' }] });
  });
});
