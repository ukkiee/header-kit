import { backupPayload } from '@/core/backup';
import type { Command } from '@/core/commands';
import { compile, type TabInfo } from '@/core/compile';
import { hasExpiredProfiles } from '@/core/expiry';
import type { NetRule } from '@/core/rules';
import type { StoredState } from '@/core/schema';
import { summarizeCompile, type StatusSummary } from '@/core/summary';
import { createCommandExecutor } from './executor';
import { createReconciler } from './reconciler';

interface Snapshot {
  state: StoredState;
  tabs: TabInfo[];
  now: number;
}

/**
 * background 컴포지션 루트가 의존하는 플랫폼 효과·리스너·시계.
 * 전부 주입되므로 부트스트랩 배선을 browser API 없이 단위 테스트할 수 있다.
 * (순수 코어 compile/summarize/…와 runtime 팩토리는 직접 import — 주입 대상 아님.)
 */
export interface BackgroundDeps {
  loadState(): Promise<StoredState>;
  persistState(state: StoredState): Promise<void>;
  publishSummary(summary: StatusSummary): Promise<void>;
  queryTabInfos(): Promise<TabInfo[]>;
  performBackup(payload: string, profileCount: number): Promise<unknown>;
  replaceSessionRules(rules: NetRule[]): Promise<void>;
  applyBadge(state: StoredState): Promise<void>;
  scheduleExpiryAlarm(state: StoredState, now: number): Promise<void>;
  validateCommand(command: Command): Promise<string | null>;
  now(): number;
  /** 백업 디바운스 타이머 — fire-and-forget(코얼레싱은 부트스트랩이 관리). */
  setTimer(callback: () => void, delayMs: number): void;
  onStateChanged(callback: () => void): void;
  onCommand(handler: (command: Command) => Promise<StoredState>): void;
  onTabsChanged(callback: () => void): void;
  onStartup(callback: () => void): void;
  onInstalled(callback: () => void): void;
  onTogglePause(callback: () => void): void;
  onExpiryAlarm(callback: () => void): void;
  logError(context: string, error: unknown): void;
}

/**
 * background 서비스워커의 컴포지션 루트 — 재조정 큐·권위 실행자·자동 백업
 * 스케줄러·이벤트 리스너를 주입된 효과 위에 배선한다. entrypoint는 실제
 * browser 효과를 채워 이 함수를 호출하기만 한다.
 */
export function bootstrap(deps: BackgroundDeps): void {
  const reconciler = createReconciler<Snapshot>({
    loadSnapshot: async () => ({
      state: await deps.loadState(),
      tabs: await deps.queryTabInfos(),
      now: deps.now(),
    }),
    compile: (snapshot) =>
      compile(snapshot.state.profiles, {
        paused: snapshot.state.paused,
        tabs: snapshot.tabs,
        now: snapshot.now,
        materialized: snapshot.state.materialized,
      }),
    // 규칙·배지·만료 알람·상태 요약을 같은 스냅샷·같은 세대 보증 아래 반영한다.
    apply: async (result, snapshot) => {
      // 규칙 적용은 실패해도(예: quota) 나머지 반영·요약을 막지 않는다 —
      // 실패는 삼키지 않고 요약의 applyError로 노출한다.
      let applyError: string | null = null;
      try {
        await deps.replaceSessionRules(result.rules);
      } catch (error) {
        applyError = error instanceof Error ? error.message : String(error);
      }
      await deps.applyBadge(snapshot.state);
      await deps.scheduleExpiryAlarm(snapshot.state, snapshot.now);
      // 요약은 background가 실제 적용한 그 결과·스냅샷에서 만든다.
      await deps.publishSummary(
        summarizeCompile(result, {
          profiles: snapshot.state.profiles,
          paused: snapshot.state.paused,
          applyError,
        }),
      );
      // 이미 지난 만료는 알람을 기다리지 않고 즉시 만료 전이를 태운다.
      if (hasExpiredProfiles(snapshot.state, snapshot.now)) {
        void executor
          .execute({ type: 'expire-profiles', now: snapshot.now })
          .catch((error) => deps.logError('expiry failed', error));
      }
    },
    onError: (error) => deps.logError('reconcile failed', error),
  });

  // 상태 전이의 단일 권위 실행자 — 모든 쓰기는 이 큐를 거친다.
  const executor = createCommandExecutor({
    load: deps.loadState,
    save: deps.persistState,
    validate: deps.validateCommand,
  });
  deps.onCommand((command) => executor.execute(command));

  const converge = () => void reconciler.requestReconcile();

  // 자동 Backup — 재조정과 별도 채널: 탭 이벤트발 재컴파일마다 sync 쓰기를 태우지
  // 않기 위한 의도적 예외. 타이머 코얼레싱 + 최소 30초 간격으로 sync quota 안쪽 유지.
  let backupScheduled = false;
  let lastBackupAt = 0;
  const runBackup = async () => {
    backupScheduled = false;
    lastBackupAt = deps.now();
    try {
      const state = await deps.loadState();
      await deps.performBackup(backupPayload(state), state.profiles.length);
    } catch (error) {
      deps.logError('backup failed', error);
    }
  };
  const scheduleBackup = () => {
    if (backupScheduled) return; // 이미 예약됨 — 가장 이른 실행 유지
    backupScheduled = true;
    const delay = Math.max(3_000, lastBackupAt + 30_000 - deps.now());
    deps.setTimer(() => void runBackup(), delay);
  };

  deps.onStateChanged(() => {
    converge();
    scheduleBackup();
  });
  deps.onTabsChanged(converge);
  deps.onStartup(converge);
  deps.onInstalled(converge);
  // Pause 토글은 권위 상태 기준으로 뒤집는 단일 writer 명령을 지난다 — 연타 안전.
  deps.onTogglePause(() => {
    void executor
      .execute({ type: 'toggle-pause' })
      .catch((error) => deps.logError('toggle-pause failed', error));
  });
  deps.onExpiryAlarm(() => {
    // 만료 전이도 단일 writer 경로를 지난다 — 저장 변경이 재컴파일·배지를 촉발한다.
    void executor
      .execute({ type: 'expire-profiles', now: deps.now() })
      .catch((error) => deps.logError('expiry failed', error));
  });

  // SW가 깨어날 때마다 저장소 기준으로 수렴 + 디바운스 중 유실된 백업 catch-up.
  converge();
  scheduleBackup();
}
