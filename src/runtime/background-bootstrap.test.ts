import { describe, expect, it } from 'vitest';
import type { Command } from '@/core/commands';
import { createDefaultState, type StoredState } from '@/core/schema';
import { bootstrap, type BackgroundDeps } from './background-bootstrap';

/** 모든 효과·리스너를 no-op으로 채운 기본 deps — 테스트가 필요한 것만 덮어쓴다. */
function fakeDeps(overrides: Partial<BackgroundDeps> = {}): BackgroundDeps {
  return {
    loadState: async () => createDefaultState(),
    readState: async () => ({ status: 'ok', state: createDefaultState() }),
    persistState: async () => {},
    publishSummary: async () => {},
    queryTabInfos: async () => [],
    performBackup: async () => undefined,
    readBackupKV: async () => ({}),
    removeBackupKeys: async () => {},
    clearSummary: async () => {},
    replaceSessionRules: async () => {},
    applyBadge: async () => {},
    scheduleExpiryAlarm: async () => {},
    validateCommand: async () => null,
    now: () => 1000,
    setTimer: () => {},
    onStateChanged: () => {},
    onCommand: () => {},
    onTabsChanged: () => {},
    onStartup: () => {},
    onInstalled: () => {},
    onTogglePause: () => {},
    onExpiryAlarm: () => {},
    logError: () => {},
    ...overrides,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('background bootstrap', () => {
  it('초기 converge가 주입 deps로 규칙·배지·요약을 반영한다 (browser API 없이)', async () => {
    let rules = false;
    let badge = false;
    let summary = false;
    let timerSet = false;
    bootstrap(
      fakeDeps({
        replaceSessionRules: async () => {
          rules = true;
        },
        applyBadge: async () => {
          badge = true;
        },
        publishSummary: async () => {
          summary = true;
        },
        setTimer: () => {
          timerSet = true;
        },
      }),
    );
    await flush();
    expect(rules).toBe(true);
    expect(badge).toBe(true);
    expect(summary).toBe(true);
    expect(timerSet).toBe(true); // 초기 scheduleBackup
  });

  it('onStateChanged가 재수렴을 촉발한다 (규칙 재적용)', async () => {
    let stateChanged = () => {};
    let ruleApplies = 0;
    bootstrap(
      fakeDeps({
        onStateChanged: (cb) => {
          stateChanged = cb;
        },
        replaceSessionRules: async () => {
          ruleApplies += 1;
        },
      }),
    );
    await flush();
    const afterInit = ruleApplies;
    stateChanged();
    await flush();
    expect(ruleApplies).toBeGreaterThan(afterInit);
  });

  it('백업 타이머는 코얼레싱된다 (초기 + 다중 트리거에도 1회 예약)', async () => {
    let stateChanged = () => {};
    let timers = 0;
    bootstrap(
      fakeDeps({
        onStateChanged: (cb) => {
          stateChanged = cb;
        },
        setTimer: () => {
          timers += 1;
        },
      }),
    );
    await flush();
    stateChanged();
    stateChanged();
    await flush();
    // 초기 scheduleBackup 1회, 이후 트리거는 이미 예약된 타이머로 코얼레싱 → 여전히 1.
    expect(timers).toBe(1);
  });

  /*
   * 읽을 수 없는 상태를 백업하지 않는다 (티켓 02 코드리뷰).
   *
   * 이 가드가 없으면 조용한 손실이 난다: 저장된 상태가 이 버전이 이해 못 하는 것이면
   * loadState가 **빈 기본 상태**로 접히고, 그것이 백업 링에 들어가 quota 회전으로 진짜
   * 스냅샷을 밀어낸다. 로컬 원본은 persistState 가드가 지켜도 백업이라는 다른 채널로
   * 같은 데이터가 사라진다 — 게다가 백업은 SW가 깨어날 때마다 예약되므로 상시 경로다.
   */
  it('읽을 수 없는 상태(blocked)에서는 백업을 건너뛴다 — 빈 스냅샷이 링을 오염시키지 않게', async () => {
    let fire = () => {};
    let backups = 0;
    const logged: string[] = [];
    bootstrap(
      fakeDeps({
        // 저장소에는 더 새 포맷이 들어 있다 — 이 버전은 읽을 수 없다.
        readState: async () => ({ status: 'blocked', reason: 'newer', storedVersion: 99 }),
        // loadState는 그것을 빈 기본 상태로 접는다(예전 동작) — 백업이 이것을 쓰면 안 된다.
        loadState: async () => createDefaultState(),
        setTimer: (cb) => {
          fire = cb;
        },
        performBackup: async () => {
          backups += 1;
          return undefined;
        },
        logError: (context) => logged.push(context),
      }),
    );
    await flush();
    fire(); // 예약된 백업 실행
    await flush();
    expect(backups).toBe(0);
    expect(logged).toContain('backup skipped');
  });

  it('읽을 수 있는 상태에서는 평소대로 백업한다', async () => {
    let fire = () => {};
    let backups = 0;
    bootstrap(
      fakeDeps({
        setTimer: (cb) => {
          fire = cb;
        },
        performBackup: async () => {
          backups += 1;
          return undefined;
        },
      }),
    );
    await flush();
    fire();
    await flush();
    expect(backups).toBe(1);
  });

  it('onCommand가 권위 실행자를 지난다 (load → 적용 → persist)', async () => {
    const base = createDefaultState();
    let handler: ((command: Command) => Promise<StoredState>) | undefined;
    let persisted: StoredState | undefined;
    bootstrap(
      fakeDeps({
        loadState: async () => base,
        onCommand: (h) => {
          handler = h;
        },
        persistState: async (state) => {
          persisted = state;
        },
      }),
    );
    await flush();
    expect(handler).toBeDefined();
    const result = await handler!({ type: 'set-paused', paused: true });
    expect(result.paused).toBe(true);
    expect(persisted?.paused).toBe(true);
  });

  it('onTogglePause가 실행자를 지나 pause를 뒤집는다 (persist)', async () => {
    const base = createDefaultState(); // paused: false
    let togglePause = () => {};
    let persisted: StoredState | undefined;
    bootstrap(
      fakeDeps({
        loadState: async () => base,
        onTogglePause: (cb) => {
          togglePause = cb;
        },
        persistState: async (state) => {
          persisted = state;
        },
      }),
    );
    await flush();
    togglePause();
    await flush();
    expect(persisted?.paused).toBe(true);
  });

  /*
   * 전체 초기화 (티켓 08, R-3) — core/reset이 정한 순서를 **실제 스케줄러**가 지키는지.
   *
   * core 테스트는 "중단 중에는 쓰지 않는다"는 계약만 알 뿐, 디바운스 타이머가 그 계약을
   * 존중하는지는 모른다. 여기서 삭제 도중에 예약된 백업을 일부러 터뜨려, 방금 비운
   * 저장소에 옛 데이터가 다시 써지지 않는지를 못 박는다.
   */
  it('전체 초기화는 자동 백업을 멈춘 채 두 저장소를 비우고, 끝난 뒤 다시 켠다', async () => {
    const areas: Record<string, Record<string, unknown>> = {
      local: { 'bk:manifest': { snapshots: [] }, 'bk:s1:0': 'chunk', state: { keep: true } },
      sync: { 'bk:manifest': { snapshots: [] }, 'bk:s2:0': 'chunk' },
    };
    const populated: StoredState = {
      ...createDefaultState(),
      theme: 'dark',
      profiles: [
        { id: 'p1', name: 'One', active: true, shortLabel: '1', color: '#2563eb', modifications: [] },
        { id: 'p2', name: 'Two', active: false, shortLabel: '2', color: '#16a34a', modifications: [] },
      ],
    };
    const timers: (() => void)[] = [];
    let handler: ((command: Command) => Promise<StoredState>) | undefined;
    let backups = 0;
    let backupsWhileResetting = 0;
    let resetting = false;
    let summaryCleared = false;

    bootstrap(
      fakeDeps({
        loadState: async () => populated,
        readState: async () => ({ status: 'ok', state: populated }),
        onCommand: (h) => {
          handler = h;
        },
        readBackupKV: async (target) => ({ ...areas[target] }),
        removeBackupKeys: async (target, keys) => {
          // 디바운스된 자동 백업이 하필 삭제 도중에 내려앉는다 — 중단이 없으면 여기서 되살아난다.
          for (const fire of timers.splice(0)) fire();
          await flush();
          for (const key of keys) delete areas[target]![key];
        },
        clearSummary: async () => {
          summaryCleared = true;
        },
        performBackup: async () => {
          backups += 1;
          if (resetting) backupsWhileResetting += 1;
          return undefined;
        },
        setTimer: (cb) => {
          timers.push(cb);
        },
      }),
    );
    await flush();
    expect(timers.length).toBeGreaterThan(0); // 초기 예약 — 초기화 중에 터질 후보

    resetting = true;
    const state = await handler!({ type: 'full-reset' });
    resetting = false;

    expect(backupsWhileResetting).toBe(0);
    expect(Object.keys(areas.local!)).toEqual(['state']); // 권위 상태는 남는다
    expect(Object.keys(areas.sync!)).toEqual([]);
    expect(state.profiles).toHaveLength(1);
    expect(summaryCleared).toBe(true);

    // 재개 — 다시 예약된 타이머가 이제는 실제로 백업한다 (깨끗한 default 스냅샷).
    expect(timers.length).toBeGreaterThan(0);
    for (const fire of timers.splice(0)) fire();
    await flush();
    expect(backups).toBeGreaterThan(0);
  });

  /*
   * 중단은 **이미 가드를 지난** in-flight 백업까지 막아야 한다. 위 테스트는 중단 이후에
   * 발화하는 타이머만 모델해 이 창이 비어 있었다.
   */
  it('중단은 가드를 이미 지난 in-flight 백업도 착지시키지 않는다', async () => {
    const areas: Record<string, Record<string, unknown>> = {
      local: {},
      sync: { 'bk:manifest': { snapshots: [] }, 'bk:s1:0': 'chunk' },
    };
    const timers: (() => void)[] = [];
    let handler: ((command: Command) => Promise<StoredState>) | undefined;
    let releaseRead = () => {};
    const readGate = new Promise<void>((resolve) => void (releaseRead = resolve));
    let reads = 0;
    const backedUp: string[] = [];

    bootstrap(
      fakeDeps({
        readState: async () => {
          reads += 1;
          if (reads === 1) await readGate; // 첫 백업은 가드를 지난 채 여기서 멈춰 있다
          return { status: 'ok', state: createDefaultState() };
        },
        performBackup: async (payload) => {
          backedUp.push(payload);
          areas.sync!['bk:late:0'] = payload;
        },
        readBackupKV: async (target) => ({ ...areas[target] }),
        removeBackupKeys: async (target, keys) => {
          for (const key of keys) delete areas[target]![key];
        },
        onCommand: (h) => {
          handler = h;
        },
        setTimer: (cb) => {
          timers.push(cb);
        },
      }),
    );
    await flush();
    for (const fire of timers.splice(0)) fire(); // 백업 시작 — readState에서 멈춘다
    await flush();
    expect(backedUp).toEqual([]); // 아직 가드를 지나 진행 중

    const reset = handler!({ type: 'full-reset' });
    releaseRead(); // in-flight 백업이 이제 performBackup 앞까지 간다
    await reset;
    await flush();

    expect(backedUp).toEqual([]); // 재검사에서 멈췄다 — 옛 payload는 착지하지 않았다
    expect(Object.keys(areas.sync!)).toEqual([]);
  });

  /*
   * 중단 전에 걸린 예약은 **취소할 수 없다**. 초기화가 삭제를 마친 뒤 reset-state에서
   * 실패하면 중단이 풀리고 상태는 아직 옛 프로필이라, 그 옛 예약이 뒤늦게 발화하면 방금
   * 지운 스냅샷이 되살아난다 (릴리스 게이트 R-1). 성공 경로 테스트는 타이머를 중단 **중**에
   * 터뜨려 이 순서를 비워 두었다.
   */
  it('실패한 초기화 뒤 발화한 옛 예약은 지운 백업을 되살리지 않는다', async () => {
    const areas: Record<string, Record<string, unknown>> = {
      local: {},
      sync: { 'bk:manifest': { snapshots: [] }, 'bk:s1:0': 'chunk' },
    };
    const populated: StoredState = {
      ...createDefaultState(),
      profiles: [
        { id: 'p1', name: 'One', active: true, shortLabel: '1', color: '#2563eb', modifications: [] },
      ],
    };
    const timers: (() => void)[] = [];
    let handler: ((command: Command) => Promise<StoredState>) | undefined;
    let backups = 0;

    bootstrap(
      fakeDeps({
        loadState: async () => populated,
        readState: async () => ({ status: 'ok', state: populated }),
        // 상태 리셋만 실패한다 — 삭제는 이미 끝난 뒤다(멱등이라 되돌리지 않는다).
        persistState: async () => {
          throw new Error('storage write failed');
        },
        readBackupKV: async (target) => ({ ...areas[target] }),
        removeBackupKeys: async (target, keys) => {
          for (const key of keys) delete areas[target]![key];
        },
        performBackup: async (payload) => {
          backups += 1;
          areas.sync!['bk:late:0'] = payload;
        },
        onCommand: (h) => {
          handler = h;
        },
        setTimer: (cb) => {
          timers.push(cb);
        },
      }),
    );
    await flush();
    expect(timers.length).toBeGreaterThan(0); // 중단 전에 걸린 예약

    await expect(handler!({ type: 'full-reset' })).rejects.toThrow();

    // 실패로 중단이 풀린 **뒤에** 옛 예약이 발화한다.
    for (const fire of timers.splice(0)) fire();
    await flush();

    expect(backups).toBe(0);
    expect(Object.keys(areas.sync!)).toEqual([]); // 지운 스냅샷이 그대로 비어 있다
  });

  it('onExpiryAlarm이 실행자를 지나 만료 전이를 태운다 (persist)', async () => {
    let expiryAlarm = () => {};
    let persistCalls = 0;
    bootstrap(
      fakeDeps({
        onExpiryAlarm: (cb) => {
          expiryAlarm = cb;
        },
        persistState: async () => {
          persistCalls += 1;
        },
      }),
    );
    await flush();
    const before = persistCalls;
    expiryAlarm();
    await flush();
    expect(persistCalls).toBeGreaterThan(before);
  });
});
