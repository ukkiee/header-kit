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
