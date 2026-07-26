import { computeBadge, drawsBadge, type BadgeSpec } from '@/core/badge';
import { backupPayload, backupTarget, type BackupTarget } from '@/core/backup';
import type { Command } from '@/core/commands';
import { compile, type TabInfo } from '@/core/compile';
import { hasExpiredRules } from '@/core/expiry';
import type { NetRule } from '@/core/rules';
import type { StoredState, StoredStateRead } from '@/core/schema';
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
  /**
   * 저장된 값을 **분류해서** 읽는다 — `loadState`가 접어 버리는 "읽을 수 없음"을 구분한다.
   *
   * 파생 데이터를 쓰기 전에 원본이 읽히는지 확인하려면 이것이 필요하다. `loadState`는
   * blocked를 기본 상태로 접으므로, 그것만 보면 "프로필 0개"와 "읽을 수 없어서 0개처럼
   * 보임"을 구분할 수 없고 그 차이가 백업을 오염시킨다(티켓 02 코드리뷰).
   */
  readState(): Promise<StoredStateRead>;
  persistState(state: StoredState): Promise<void>;
  publishSummary(summary: StatusSummary): Promise<void>;
  queryTabInfos(): Promise<TabInfo[]>;
  /** 대상 저장소는 상태의 sync 스위치가 정한다 — 어댑터는 받은 곳에 쓴다 (티켓 07). */
  performBackup(payload: string, profileCount: number, target: BackupTarget): Promise<unknown>;
  replaceSessionRules(rules: NetRule[]): Promise<void>;
  /**
   * 계산된 배지를 툴바에 반영한다 — 어댑터는 그대로 그리기만 한다.
   *
   * 배지가 세는 것은 적용된 규칙 수라, 무엇을 그릴지는 이 스냅샷의 상태만으로 알 수 없다
   * (quota·컴파일로 빠진 규칙이 있다). 계산은 요약을 가진 이 컴포지션 루트가 한다.
   */
  applyBadge(badge: BadgeSpec): Promise<void>;
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
  // 상태 전이의 단일 권위 실행자 — 모든 쓰기는 이 큐를 거친다. reconciler.apply의
  // 만료 재전이가 이 실행자를 참조하므로 먼저 선언한다.
  const executor = createCommandExecutor({
    load: deps.loadState,
    save: deps.persistState,
    validate: deps.validateCommand,
  });

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
      // 요약은 background가 실제 적용한 그 결과·스냅샷에서 만든다.
      const summary = summarizeCompile(result, {
        profiles: snapshot.state.profiles,
        paused: snapshot.state.paused,
        applyError,
      });
      // 배지도 같은 요약을 본다 — 화면의 "적용 중인 규칙 수"와 툴바가 갈라지지 않는다.
      // 적용이 실패했으면 직전 규칙 세트가 그대로 걸려 있으므로 배지도 직전 값을 유지한다.
      if (drawsBadge(summary, snapshot.state.badgeVisible)) {
        await deps.applyBadge(computeBadge(summary, snapshot.state.badgeVisible));
      }
      await deps.scheduleExpiryAlarm(snapshot.state, snapshot.now);
      await deps.publishSummary(summary);
      // 이미 지난 만료는 알람을 기다리지 않고 즉시 만료 전이를 태운다.
      if (hasExpiredRules(snapshot.state, snapshot.now)) {
        void executor
          .execute({ type: 'expire-rules', now: snapshot.now })
          .catch((error) => deps.logError('expiry failed', error));
      }
    },
    onError: (error) => deps.logError('reconcile failed', error),
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
      /*
       * 원본을 읽을 수 없으면 백업하지 않는다.
       *
       * 이 가드가 없으면 조용한 데이터 손실이 난다: 저장된 상태가 이 버전이 이해 못 하는
       * 것(더 새 포맷이거나 올릴 수 없는 구 포맷)일 때 `loadState`는 **빈 기본 상태**로 접히고,
       * 그것이 백업 링에 스냅샷으로 들어가 quota 회전으로 **진짜 스냅샷을 밀어낸다**.
       * 로컬 원본은 `persistState` 가드가 지켜도, 백업이라는 다른 채널로 같은 손실이 난다.
       * 백업은 SW가 깨어날 때마다 예약되므로 이 경로는 잠재적이 아니라 상시다.
       */
      const read = await deps.readState();
      if (read.status === 'blocked') {
        deps.logError(
          'backup skipped',
          new Error(
            `stored state is unreadable (${read.reason}, v${read.storedVersion}); keeping existing backups intact`,
          ),
        );
        return;
      }
      const state = read.state;
      await deps.performBackup(backupPayload(state), state.profiles.length, backupTarget(state));
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
      .execute({ type: 'expire-rules', now: deps.now() })
      .catch((error) => deps.logError('expiry failed', error));
  });

  // SW가 깨어날 때마다 저장소 기준으로 수렴 + 디바운스 중 유실된 백업 catch-up.
  converge();
  scheduleBackup();
}
