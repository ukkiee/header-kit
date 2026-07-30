import { computeBadge, drawsBadge, type BadgeSpec } from '@/core/badge';
import type { BackupTarget } from '@/core/backup';
import type { Command } from '@/core/commands';
import type { MessageKey } from '@/core/i18n';
import type { ResetStep } from '@/core/reset';
import { compile, type TabInfo } from '@/core/compile';
import { hasExpiredRules } from '@/core/expiry';
import type { NetRule } from '@/core/rules';
import type { StoredState } from '@/core/schema';
import { summarizeCompile, type StatusSummary } from '@/core/summary';
import type { DeleteSnapshotResult, StateWriter } from '@/core/state-writer';
import { createReconciler } from './reconciler';

/**
 * 멈춘 단계는 **카탈로그 키**로 올려 보낸다 — 내부 식별자(`clear-sync-backups`)가 영어
 * 그대로 배너에 앉지 않게. 화면이 이 키를 로케일 문구로 푼다.
 */
const RESET_STOP_MESSAGE: Record<ResetStep, MessageKey> = {
  'clear-local-backups': 'resetStoppedAtLocalBackups',
  'clear-sync-backups': 'resetStoppedAtSyncBackups',
  'reset-state': 'resetStoppedAtState',
  'clear-summary': 'resetStoppedAtSummary',
};

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
   * 영속 저장소를 고치는 **유일한 문** (ADR 0016) — 구현은 `platform/state-writer`가 주고,
   * 이 컴포지션 루트는 그 매소드만 부른다.
   *
   * 쓰기 허가가 이 인터페이스에 **나타나지 않는 것**이 요점이다. 허가가 dep 파라미터였을 때는
   * 그 슬롯에 들어가는 래퍼가 작업 도중 살아 있는 허가를 쥐고 fan-out할 수 있었고, 그러면
   * 릴리스 r3의 R-2가 그대로 되살아났다(structure r1 뒤 적대적 검증에서 실증). 지금은 겹쳐
   * 불러도 각 호출이 자기 레인 작업이 되어 정상적으로 직렬화된다.
   */
  stateWriter: StateWriter;
  publishSummary(summary: StatusSummary): Promise<void>;
  queryTabInfos(): Promise<TabInfo[]>;
  /** 렌더러의 삭제 요청을 받는다 — 핸들러의 결과가 그대로 응답이 된다. */
  onSnapshotDeleteRequest(
    handler: (snapshotId: string, target: BackupTarget) => Promise<DeleteSnapshotResult>,
  ): void;
  replaceSessionRules(rules: NetRule[]): Promise<void>;
  /**
   * 계산된 배지를 툴바에 반영한다 — 어댑터는 그대로 그리기만 한다.
   *
   * 배지가 세는 것은 적용된 규칙 수라, 무엇을 그릴지는 이 스냅샷의 상태만으로 알 수 없다
   * (quota·컴파일로 빠진 규칙이 있다). 계산은 요약을 가진 이 컴포지션 루트가 한다.
   */
  applyBadge(badge: BadgeSpec): Promise<void>;
  scheduleExpiryAlarm(state: StoredState, now: number): Promise<void>;
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
  /*
   * 영속 저장소를 고치는 단 하나의 문 (ADR 0016) — 주입받는다. 이 파일에는 쓰기 허가가
   * 한 번도 등장하지 않고, 등장할 수 없다: `StateWriter`의 어느 매소드도 허가를 받지 않는다.
   * 그것이 이 설계의 핵이다 (structure 게이트 r1과 그 뒤 적대적 검증 두 라운드).
   */
  const writer = deps.stateWriter;

  /**
   * 명령 채널을 거치지 않고 실행자를 **직접** 부르던 경로들이 공유하는 진입점 — 실패는
   * 요청한 쪽이 없으므로 맥락과 함께 로그로만 남긴다.
   *
   * 이 셋(전역 Pause 토글 · 만료 알람 · 재조정 중 발견된 지난 만료)이 레인 진입점 목록에서
   * 빠졌던 것이 플랜 게이트 r1의 R-1이다. 한 자리로 모아 두면 다음에 같은 모양이 하나 더
   * 생겨도 문 밖으로 새지 않는다.
   */
  const runCommand = (context: string, command: Command): void => {
    void writer.execute(command).catch((error) => deps.logError(context, error));
  };

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
      // 이미 지난 만료는 알람을 기다리지 않고 즉시 만료 전이를 태운다 — 재조정은 레인 밖에서
      // 도는 읽기 경로이므로, 이 전이는 여기서 레인을 새로 잡아 올린다(진입점).
      if (hasExpiredRules(snapshot.state, snapshot.now)) {
        runCommand('expiry failed', { type: 'expire-rules', now: snapshot.now });
      }
    },
    onError: (error) => deps.logError('reconcile failed', error),
  });

  const converge = () => void reconciler.requestReconcile();

  /*
   * 자동 Backup — 재조정과 별도 채널: 탭 이벤트발 재컴파일마다 sync 쓰기를 태우지 않기 위한
   * 의도적 예외. 타이머 코얼레싱 + 최소 30초 간격으로 sync quota 안쪽 유지.
   *
   * 여기 남은 것은 **예약 정책뿐이다** (D8). 레인이 흡수한 것들 — 겹친 작업이 서로의 창을
   * 열지 않게 하던 깊이 카운터, 진행 중 백업을 기다리는 드레인 await, 백업 본문의 이중 중단
   * 검사 — 은 티켓 02에서 걷어냈다. 스냅샷 쓰기가 이제 레인 작업이므로 삭제·초기화와 겹칠 수
   * 없고, 그 셋이 만들던 창도 함께 사라진다.
   */
  let backupScheduled = false;
  let lastBackupAt = 0;
  /**
   * 예약 세대 — `setTimer`는 취소할 수 없으므로 중단이 이 값을 올려 이미 걸린 타이머를
   * **무효화**한다. 레인이 이것을 대체하지 않는다: 순서대로 돌아도, 실패한 초기화 뒤에 옛
   * 예약이 발화하면 상태가 아직 옛 프로필이라 방금 지운 백업이 되살아난다 (D8).
   */
  let backupGeneration = 0;

  const scheduleBackup = () => {
    if (backupScheduled) return; // 이미 예약됨 — 가장 이른 실행 유지
    backupScheduled = true;
    const generation = backupGeneration;
    const delay = Math.max(3_000, lastBackupAt + 30_000 - deps.now());
    deps.setTimer(() => {
      // 중단이 무효화한 예약이면 발화해도 쓰지 않는다. 예약 자리는 중단이 이미 비웠으므로
      // 여기서 되돌리지 않는다 — 그 사이 걸린 새 예약을 덮어쓰지 않기 위해서다.
      if (generation !== backupGeneration) return;
      backupScheduled = false;
      lastBackupAt = deps.now();
      void writer.snapshot().then(
        (outcome) => {
          // 건너뛴 것은 오류가 아니지만 조용히 묻히면 안 된다 — 저장소가 읽히지 않는다는
          // 사실이 백업이 멈춘 이유이므로 드러낸다.
          if (outcome.status === 'skipped') deps.logError('backup skipped', new Error(outcome.reason));
        },
        (error: unknown) => deps.logError('backup failed', error),
      );
    }, delay);
  };

  /**
   * `bk:`를 건드리기 직전에 자동 Backup 예약을 **무효화**한다 (D8).
   *
   * 티켓 02 이전에는 여기서 깊이를 올리고 진행 중인 백업을 드레인했다. 그 둘은 레인이
   * 흡수했다 — 백업 쓰기가 레인 작업이므로 초기화와 겹칠 수 없다. 남은 일은 취소할 수 없는
   * 타이머를 무효화하는 것뿐이고, 그것은 직렬화가 풀지 못하는 문제다: 발화 시점이 초기화
   * **뒤**여도 그 백업이 쓰는 것은 초기화가 실패했을 때의 **옛 프로필**이다.
   */
  const suspendBackupWrites = (): void => {
    backupGeneration += 1;
    backupScheduled = false;
  };

  /**
   * 예약을 되살린다. 초기화가 **끝까지 갔을 때만** 곧바로 다시 예약한다 — 그때 스냅샷되는
   * 것은 깨끗한 default다. 실패했다면 상태가 아직 옛 프로필이라 지금 예약하면 방금 지운
   * 백업이 되살아난다. 그 경우는 예약 없이 두고, 다음 상태 변경이 정상적으로 다시 예약한다.
   */
  const resumeBackupWrites = ({ reschedule }: { reschedule: boolean }): void => {
    if (reschedule) scheduleBackup();
  };

  /**
   * 전체 초기화 (R-3) — 순서·검증은 core/reset이 정하고, 여기서는 상태 밖 효과를 채운다.
   *
   * 이 한 연산이 로컬 백업·클라우드 백업·권위 상태를 다 만지므로 **전체가 한 번의 획득 안**에
   * 있어야 한다. 그 획득은 쓰기 서비스가 하고, 안쪽 상태 리셋도 그 안에서 순차로 돈다 —
   * 그래서 초기화 도중 도착한 명령과 마지막 쓰기를 다투지 않는다.
   */
  const fullReset = async (): Promise<StoredState> => {
    /*
     * 예약 무효화를 **요청 경계에서** 한 번 더 한다 (티켓 02).
     *
     * `core/reset`이 작업 본문 시작에서 `suspendAutoBackup`을 부르지만, 요청이 레인에 서고
     * 본문이 시작되기까지의 사이에 발화한 타이머는 아직 옛 세대를 보고 스냅샷을 레인에
     * 세운다. 그 스냅샷은 초기화 **뒤에** 돌고, 초기화가 reset-state에서 실패했다면 상태가
     * 아직 옛 프로필이라 방금 지운 백업을 되살린다. 티켓 02 이전에는 백업 본문의 이중 중단
     * 검사가 이 창을 막았는데 레인이 그것을 걷어냈으므로, 무효화를 그 창 **앞으로** 옮긴다.
     * 세대는 단조 증가라 두 번 올려도 무해하다.
     */
    suspendBackupWrites();
    const { result, state } = await writer.fullReset({
      suspendAutoBackup: suspendBackupWrites,
      resumeAutoBackup: ({ snapshot }) => {
        // 끝까지 간 초기화만 곧바로 다시 예약한다 — 무효화가 눌러 버린 예약이 사라진 자리를
        // 메우고, 그때 스냅샷되는 것은 깨끗한 default다. 실패했다면 상태가 아직 옛 프로필이라
        // 지금 예약하면 방금 지운 백업이 되살아난다. 그 경우는 예약 없이 두고, 다음 상태
        // 변경이 정상적으로 다시 예약하게 둔다(삭제와 다른 점).
        resumeBackupWrites({ reschedule: snapshot });
      },
    });
    // 실패는 삼키지 않는다 — 어디서 멈췄는지 그대로 올려 보내 사용자가 다시 누를 수 있게 한다.
    if (!result.ok) {
      // 원인 문자열(브라우저 오류)은 로그로 남기고, 화면에는 카탈로그 키만 올려 보낸다.
      deps.logError('full reset failed', new Error(`${result.step}: ${result.reason}`));
      throw new Error(RESET_STOP_MESSAGE[result.step]);
    }
    return state ?? (await deps.loadState());
  };

  // ── 레인 진입점 (ADR 0016 D2의 표) — 권위 상태를 쓰는 경로는 여기가 전부다 ──

  deps.onCommand((command) =>
    command.type === 'full-reset' ? fullReset() : writer.execute(command),
  );
  /*
   * 스냅샷 한 행 삭제 — 쓰기 문이 그대로 받는다 (티켓 02).
   *
   * 티켓 02 이전에는 여기에 삭제가 자동 Backup을 중단하고 드레인한 뒤 지우는 래퍼가 있었다.
   * 그 둘이 필요했던 이유는 삭제의 읽기와 매니페스트 통째 쓰기 사이에 백업 커밋이 착지할 수
   * 있었기 때문인데, 지금은 둘 다 레인 작업이라 겹칠 수 없다. 중단이 사라지니 그것이 비운
   * 예약 자리를 되살릴 필요도 없어졌다 — 걸려 있던 타이머가 그대로 발화한다. 그래서 이 진입점에
   * 부트스트랩이 더할 것이 없다.
   */
  deps.onSnapshotDeleteRequest((snapshotId, target) => writer.deleteSnapshot(snapshotId, target));

  deps.onStateChanged(() => {
    converge();
    scheduleBackup();
  });
  deps.onTabsChanged(converge);
  deps.onStartup(converge);
  deps.onInstalled(converge);
  // Pause 토글은 명령 채널이 아니라 브라우저 커맨드로 들어온다 — 권위 상태 기준으로 뒤집는
  // 전이를 레인에 태우므로 연타 안전.
  deps.onTogglePause(() => runCommand('toggle-pause failed', { type: 'toggle-pause' }));
  // 만료 알람도 명령 채널을 거치지 않는다 — 같은 진입점을 지난다.
  deps.onExpiryAlarm(() =>
    runCommand('expiry failed', { type: 'expire-rules', now: deps.now() }),
  );

  // SW가 깨어날 때마다 저장소 기준으로 수렴 + 디바운스 중 유실된 백업 catch-up.
  //
  // 마이그레이션 커밋은 재조정 **바깥**에서 한 번만 — loadSnapshot 안에서 쓰면 그 쓰기가
  // 자기 세대를 무효화해 apply가 통째로 한 왕복 밀린다(티켓 14). 커밋 실패는 삼키지 않고
  // 드러내되 수렴은 계속한다 — 저장소가 v1로 남아도 규칙은 걸려야 한다.
  //
  // MV3: 이벤트 리스너는 위에서 이미 서비스워커 첫 턴에 동기 등록됐다. 커밋은 그 뒤에
  // 돌므로 `bootstrap()` 자체를 await 뒤로 미루지 않는다. 그래서 커밋과 명령은 **양쪽 순서
  // 모두** 가능하고, 레인이 그 둘을 도착 순서대로 세운다: 명령이 먼저면 저장소가 이미 새
  // 버전이라 커밋이 "할 일 없음"으로 물러나고, 커밋이 먼저면 명령이 올라간 상태 위에서
  // 계산된다. 어느 쪽에서도 사용자 편집이 사라지지 않는다 (D2).
  void writer
    .commitMigration()
    .catch((error: unknown) => deps.logError('migration commit failed', error))
    .finally(() => {
      converge();
      scheduleBackup();
    });
}
