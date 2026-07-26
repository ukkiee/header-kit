import { describe, expect, it } from 'vitest';
import {
  BACKUP_MANIFEST_KEY,
  backupKeys,
  backupPayload,
  backupTarget,
  planBackup,
  type BackupTarget,
  type SyncKV,
} from './backup';
import { applyCommand } from './commands';
import { createDefaultState, createProfile, type StoredState } from './schema';
import { performFullReset, type ResetEffects, type ResetResult } from './reset';

/**
 * 전체 초기화 (R-3) — 파괴적이고 되돌릴 수 없다. 그래서 여기서 보는 것은 원자성이 아니라
 * **멱등·재시도**다: 어디서 실패해도 다시 눌러 끝까지 밀 수 있는가, 그리고 자동 백업이
 * 끼어들어 방금 지운 데이터를 되살리지 않는가.
 */

let sequence = 0;

/** 스냅샷 하나를 실제 계획대로 커밋한다 (backup.test.ts와 같은 방식). */
function commit(kv: SyncKV, text: string): SyncKV {
  sequence += 1;
  const plan = planBackup(kv, text, { profileCount: 1 }, {
    id: () => `snap-${sequence}`,
    now: () => 1_000 + sequence,
  });
  if (plan.kind === 'skip') return kv;
  if (plan.kind !== 'write') throw new Error(`unexpected plan: ${plan.kind}`);
  const next: SyncKV = { ...kv };
  for (const key of plan.preRemoves) delete next[key];
  Object.assign(next, plan.chunkWrites, { [BACKUP_MANIFEST_KEY]: plan.manifest });
  for (const key of plan.postRemoves) delete next[key];
  return next;
}

/** 두 저장소 + 권위 상태 + 세션 요약이 함께 있는 세계. local 구역에는 `state`도 산다. */
interface World {
  areas: Record<BackupTarget, SyncKV>;
  state: StoredState;
  summary: unknown;
  suspended: boolean;
  steps: string[];
}

function populatedState(): StoredState {
  const base = createDefaultState();
  return {
    ...base,
    theme: 'dark',
    badgeVisible: false,
    syncBackup: true,
    profiles: [
      { ...createProfile('Staging', { id: 'p1' }), active: true },
      { ...createProfile('Prod', { id: 'p2' }) },
    ],
    materialized: { m1: 'materialized-value' },
    customHeaderNames: ['X-Custom'],
  };
}

function populatedWorld(): World {
  const state = populatedState();
  const payload = backupPayload(state);
  return {
    areas: {
      // 백업과 권위 상태가 같은 구역을 나눠 쓴다 — 초기화가 구역 비우기로 번역되면 안 된다.
      local: { ...commit({}, `local ${payload}`), state: { kept: true } },
      sync: commit({}, `cloud ${payload}`),
    },
    state,
    summary: { ruleCount: 3 },
    suspended: false,
    steps: [],
  };
}

/** 디바운스된 자동 백업이 지금 내려앉는다면 — 중단 중이면 아무것도 쓰지 않는다. */
function autoBackupTick(world: World): void {
  if (world.suspended) return;
  const target = backupTarget(world.state);
  world.areas[target] = commit(world.areas[target], backupPayload(world.state));
}

interface FakeOptions {
  /** 매 효과 뒤에 자동 백업이 끼어든다 — 최악의 타이밍을 상시로 만든다. */
  interleaveAutoBackup?: boolean;
  /** 이 대상의 remove가 한 번 던진다 (부분 실패 재현). */
  failRemoveOn?: BackupTarget;
}

function effectsFor(world: World, options: FakeOptions = {}): ResetEffects {
  let failed = false;
  const step = (name: string) => {
    world.steps.push(name);
    if (options.interleaveAutoBackup) autoBackupTick(world);
  };
  return {
    suspendAutoBackup: () => {
      world.suspended = true;
      step('suspend');
    },
    resumeAutoBackup: () => {
      world.suspended = false;
      step('resume');
    },
    readBackupKV: async (target) => ({ ...world.areas[target] }),
    removeBackupKeys: async (target, keys) => {
      step(`remove:${target}`);
      if (options.failRemoveOn === target && !failed) {
        failed = true;
        throw new Error('QUOTA_BYTES quota exceeded');
      }
      for (const key of keys) delete world.areas[target][key];
    },
    resetState: async () => {
      world.state = applyCommand(world.state, { type: 'full-reset' });
      step('reset-state');
    },
    clearSummary: async () => {
      world.summary = null;
      step('clear-summary');
    },
  };
}

const bkKeys = (kv: SyncKV) => backupKeys(kv);

/** 기본 프로필의 id는 매번 새로 발급된다 — 그것만 빼고 기본 상태와 동치인지 본다. */
function shapeOf(state: StoredState) {
  return { ...state, profiles: state.profiles.map(({ id: _id, ...rest }) => rest) };
}

function expectDefaults(state: StoredState) {
  expect(shapeOf(state)).toEqual(shapeOf(createDefaultState()));
}

describe('full-reset 커맨드', () => {
  it('프로필·선호값·실체화 값을 한 번에 기본값으로 되돌린다', () => {
    const next = applyCommand(populatedState(), { type: 'full-reset' });

    expectDefaults(next);
    expect(next.profiles).toHaveLength(1);
    expect(next.theme).toBe('system');
    expect(next.badgeVisible).toBe(true);
    expect(next.syncBackup).toBe(true);
    expect(next.materialized).toEqual({});
    expect(next.customHeaderNames).toEqual([]);
  });
});

describe('전체 초기화 (R-3, 멱등)', () => {
  it('채워진 local·sync에서 열거된 키와 상태를 모두 비운다', async () => {
    const world = populatedWorld();

    const result = await performFullReset(effectsFor(world));

    expect(result).toEqual({ ok: true } satisfies ResetResult);
    expect(bkKeys(world.areas.local)).toEqual([]);
    expect(bkKeys(world.areas.sync)).toEqual([]);
    // 같은 구역의 권위 상태 키는 백업 삭제에 휩쓸리지 않는다.
    expect(world.areas.local.state).toEqual({ kept: true });
    expectDefaults(world.state);
    expect(world.summary).toBeNull();
  });

  it('자동 백업을 먼저 중단하고 마지막에 재개한다 — 순서가 계약이다', async () => {
    const world = populatedWorld();

    await performFullReset(effectsFor(world));

    expect(world.steps[0]).toBe('suspend');
    expect(world.steps.at(-1)).toBe('resume');
    expect(world.steps.indexOf('reset-state')).toBeGreaterThan(world.steps.indexOf('remove:sync'));
    expect(world.suspended).toBe(false);
  });

  it('초기화 중 자동 백업이 끼어들어도 방금 지운 데이터가 되살아나지 않는다', async () => {
    const world = populatedWorld();

    await performFullReset(effectsFor(world, { interleaveAutoBackup: true }));

    // 중단 창 안의 어떤 틱도 쓰지 못했다 — 지운 프로필이 어느 저장소로도 돌아오지 않는다.
    const dump = JSON.stringify(world.areas);
    expect(dump).not.toContain('Staging');
    expect(dump).not.toContain('Prod');
    expect(bkKeys(world.areas.local)).toEqual([]);

    // 재개 뒤의 첫 스냅샷은 **깨끗한 default**다 (의도된 동작).
    expect(bkKeys(world.areas[backupTarget(world.state)]).length).toBeGreaterThan(0);
    expect(JSON.stringify(world.areas[backupTarget(world.state)])).toContain('Default Profile');
  });

  it('한 단계가 실패하면 오류를 표면화하되 완료된 삭제를 되돌리지 않는다', async () => {
    const world = populatedWorld();

    const result = await performFullReset(effectsFor(world, { failRemoveOn: 'sync' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.step).toBe('clear-sync-backups');
    expect(result.reason).toContain('QUOTA_BYTES');
    // 롤백 없음: 이미 지운 local 백업은 되살아나지 않는다.
    expect(bkKeys(world.areas.local)).toEqual([]);
    expect(bkKeys(world.areas.sync).length).toBeGreaterThan(0);
    // 남은 단계는 실행되지 않았고, 자동 백업은 영구히 멈추지 않는다.
    expect(world.state.profiles).toHaveLength(2);
    expect(world.suspended).toBe(false);
  });

  it('실패 후 다시 실행하면 남은 단계를 끝까지 마친다 (재시도, 롤백 아님)', async () => {
    const world = populatedWorld();
    const effects = effectsFor(world, { failRemoveOn: 'sync' });

    expect((await performFullReset(effects)).ok).toBe(false);
    const second = await performFullReset(effects);

    expect(second).toEqual({ ok: true } satisfies ResetResult);
    expect(bkKeys(world.areas.local)).toEqual([]);
    expect(bkKeys(world.areas.sync)).toEqual([]);
    expectDefaults(world.state);
    // 이미 비어 있던 local은 지울 키가 없어 remove 자체를 부르지 않는다.
    expect(world.steps.filter((s) => s === 'remove:local')).toHaveLength(1);
  });

  it('이미 깨끗한 상태에서 다시 눌러도 안전하다 (멱등)', async () => {
    const world = populatedWorld();

    expect((await performFullReset(effectsFor(world))).ok).toBe(true);
    const again = await performFullReset(effectsFor(world));

    expect(again).toEqual({ ok: true } satisfies ResetResult);
    expectDefaults(world.state);
    expect(bkKeys(world.areas.sync)).toEqual([]);
  });
});
