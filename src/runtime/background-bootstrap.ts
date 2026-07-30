import { computeBadge, drawsBadge, type BadgeSpec } from '@/core/badge';
import { backupPayload, backupTarget, type BackupTarget, type SyncKV } from '@/core/backup';
import type { Command } from '@/core/commands';
import type { MessageKey } from '@/core/i18n';
import type { ResetStep } from '@/core/reset';
import { compile, type TabInfo } from '@/core/compile';
import { hasExpiredRules } from '@/core/expiry';
import type { NetRule } from '@/core/rules';
import type { StoredState, StoredStateRead } from '@/core/schema';
import { summarizeCompile, type StatusSummary } from '@/core/summary';
import type { StateWriter } from '@/core/state-writer';
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
   * 저장된 값을 **분류해서** 읽는다 — `loadState`가 접어 버리는 "읽을 수 없음"을 구분한다.
   *
   * 파생 데이터를 쓰기 전에 원본이 읽히는지 확인하려면 이것이 필요하다. `loadState`는
   * blocked를 기본 상태로 접으므로, 그것만 보면 "프로필 0개"와 "읽을 수 없어서 0개처럼
   * 보임"을 구분할 수 없고 그 차이가 백업을 오염시킨다(티켓 02 코드리뷰).
   */
  readState(): Promise<StoredStateRead>;
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
  /** 대상 저장소는 상태의 sync 스위치가 정한다 — 어댑터는 받은 곳에 쓴다 (티켓 07). */
  performBackup(payload: string, profileCount: number, target: BackupTarget): Promise<unknown>;
  /** 백업 네임스페이스(`bk:`)만 읽는다 — 전체 초기화가 같은 구역의 권위 상태를 넘보지 않게. */
  readBackupKV(target: BackupTarget): Promise<SyncKV>;
  removeBackupKeys(target: BackupTarget, keys: string[]): Promise<void>;
  /**
   * 스냅샷 한 행을 지운다 (release R2-3) — 결과는 잔여 개수를 든 객체로 돌아온다.
   *
   * 이 효과가 여기 있는 이유는 삭제가 **서비스워커 한 곳**에서만 일어나야 하기 때문이다.
   * `bk:manifest`의 writer가 자동 Backup(서비스워커)과 삭제(렌더러)로 갈리면, 읽기와
   * 통째 쓰기 사이에 착지한 커밋이 조용히 사라진다.
   */
  deleteBackupSnapshot(snapshotId: string, target: BackupTarget): Promise<unknown>;
  /** 렌더러의 삭제 요청을 받는다 — 핸들러의 결과가 그대로 응답이 된다. */
  onSnapshotDeleteRequest(
    handler: (snapshotId: string, target: BackupTarget) => Promise<unknown>,
  ): void;
  /** 세션 요약을 지운다 (전체 초기화) — 다음 재조정이 새 요약을 발행한다. */
  clearSummary(): Promise<void>;
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

  // 자동 Backup — 재조정과 별도 채널: 탭 이벤트발 재컴파일마다 sync 쓰기를 태우지
  // 않기 위한 의도적 예외. 타이머 코얼레싱 + 최소 30초 간격으로 sync quota 안쪽 유지.
  let backupScheduled = false;
  let lastBackupAt = 0;
  /**
   * `bk:`를 건드리는 작업이 진행 중인 **깊이** (R-3, release R2-3) — 0보다 크면 스냅샷을
   * 쓰지 않는다.
   *
   * boolean이 아니라 카운터인 이유: 사용자가 둘이다(전체 초기화·스냅샷 삭제). 겹쳐
   * 들어왔을 때 먼저 끝난 쪽이 플래그를 되돌리면 다른 쪽의 창이 열린 채 남아, 이 중단이
   * 막으려던 그 실패를 새로 만든다.
   */
  let suspendDepth = 0;
  /** 진행 중인 백업 — 중단은 이것을 기다려야 가드를 이미 지난 스냅샷이 뒤늦게 착지하지 않는다. */
  let inFlightBackup: Promise<void> = Promise.resolve();
  /**
   * 예약 세대 — `setTimer`는 취소할 수 없으므로 중단이 이 값을 올려 이미 걸린 타이머를
   * **무효화**한다. 없으면 초기화가 삭제 뒤에 실패해 중단이 풀린 다음 옛 예약이 발화해,
   * 방금 지운 백업을 옛 상태로 되살린다.
   */
  let backupGeneration = 0;
  const runBackup = async () => {
    backupScheduled = false;
    /*
     * 중단 중이면 아무것도 쓰지 않는다. 없으면 디바운스 중이던 스냅샷이 방금 비운
     * 저장소에 옛 프로필을 다시 써 넣어, 사용자 눈에는 "초기화했는데 백업이 되살아난"
     * 것으로 보인다. 재개가 직접 다시 예약하므로 여기서 예약을 되살릴 필요는 없다.
     *
     * 이 한 번의 검사만으로는 부족하다 — 아래 두 await 사이에 초기화가 시작되면 이미
     * 가드를 지난 이 실행은 막히지 않는다. 그래서 performBackup 직전에 다시 보고,
     * 중단하는 쪽은 진행 중인 이 promise를 기다린다.
     */
    if (suspendDepth > 0) return;
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
      // 재검사: 여기 도달하기까지 지나온 await 동안 초기화가 시작됐을 수 있다. 이 스냅샷은
      // 옛 payload를 들고 있어, 삭제·검증이 끝난 뒤에 착지하면 그대로 남는다.
      if (suspendDepth > 0) return;
      const state = read.state;
      await deps.performBackup(backupPayload(state), state.profiles.length, backupTarget(state));
    } catch (error) {
      deps.logError('backup failed', error);
    }
  };
  const scheduleBackup = () => {
    if (backupScheduled) return; // 이미 예약됨 — 가장 이른 실행 유지
    backupScheduled = true;
    const generation = backupGeneration;
    const delay = Math.max(3_000, lastBackupAt + 30_000 - deps.now());
    deps.setTimer(() => {
      // 중단이 무효화한 예약이면 발화해도 쓰지 않는다. 예약 자리는 중단이 이미 비웠으므로
      // 여기서 되돌리지 않는다 — 그 사이 걸린 새 예약을 덮어쓰지 않기 위해서다.
      if (generation !== backupGeneration) return;
      inFlightBackup = runBackup();
    }, delay);
  };

  /**
   * `bk:`를 건드리기 직전에 자동 Backup을 멈추고 **드레인**한다 (R-3, release R2-3).
   *
   * 세 가지를 함께 한다:
   * 1. 깊이를 올린다 — 겹친 작업이 서로의 창을 열지 않는다.
   * 2. 세대를 올리고 예약 자리를 비운다 — `setTimer`는 취소할 수 없으므로 이미 걸린
   *    타이머는 발화해도 쓰지 않는다.
   * 3. 진행 중인 백업을 **기다린다** — 플래그만 세우고 돌아오면 이미 가드를 지난 그
   *    백업이 읽기와 쓰기 사이에 그대로 착지한다. 재검사 앞이었다면 거기서 멈추고,
   *    이미 재검사를 지났다면 커밋까지 끝난 뒤에야 우리가 읽는다 — 어느 쪽이든 그
   *    쓰기가 우리 읽기 **앞에** 놓인다는 것이 이 await가 사는 이유다.
   */
  const suspendBackupWrites = async (): Promise<void> => {
    suspendDepth += 1;
    backupGeneration += 1;
    backupScheduled = false;
    await inFlightBackup;
  };

  /** 재예약을 요구한 겹이 하나라도 있었는가 — 요구는 깊이 해제를 살아남는다 (release R2 R-11). */
  let rescheduleOnResume = false;
  /**
   * 중단을 푼다. `reschedule`을 요구한 겹이 있었으면 마지막 한 겹이 풀릴 때 **반드시**
   * 다시 예약한다.
   *
   * 중단이 예약 자리를 비웠으므로 여기서 되살리지 않으면 다음 `onStateChanged`까지
   * 백업이 없다. 전체 초기화는 상태가 바뀌어 그 이벤트가 뒤따르지만, **스냅샷 삭제는
   * `storage.local.state`를 건드리지 않아 그 복구가 없다** — 되살리지 않으면 그 백업은
   * 영구히 사라진다.
   *
   * 그래서 요구를 이 호출의 인자로만 보면 안 된다 (R-11): 삭제와 **실패한** 초기화가 겹쳐
   * 요구하지 않은 쪽(`reschedule: snapshot === false`)이 마지막에 풀리면, 깊이만 보는 판단은
   * 삭제가 명령한 재예약을 삼킨다 — 두 중단이 서로 간섭한다는 그 실패가 플래그에서 재예약
   * 비트로 옮겨 온 것뿐이다.
   */
  const resumeBackupWrites = ({ reschedule }: { reschedule: boolean }): void => {
    rescheduleOnResume ||= reschedule;
    suspendDepth = Math.max(0, suspendDepth - 1);
    if (suspendDepth > 0) return;
    if (rescheduleOnResume) scheduleBackup();
    rescheduleOnResume = false;
  };

  /**
   * 스냅샷 한 행 삭제 — **서비스워커가 집행한다** (release R2-3).
   *
   * 렌더러가 직접 지우면 `bk:manifest`의 writer가 두 JS 컨텍스트에 서고, 삭제의 읽기와
   * 통째 쓰기 사이에 자동 Backup의 커밋이 착지해 조용히 사라진다. `browser.storage`에
   * CAS가 없으므로 인프로세스 락으로는 원리적으로 못 고친다 — writer를 하나로 세우는
   * 것이 유일한 답이다. 삭제는 실패해도 던지지 않고 결과 객체로 돌려준다.
   */
  const deleteSnapshot = async (snapshotId: string, target: BackupTarget): Promise<unknown> => {
    await suspendBackupWrites();
    try {
      return await deps.deleteBackupSnapshot(snapshotId, target);
    } finally {
      // 삭제는 상태를 바꾸지 않아 onStateChanged가 뒤따르지 않는다 — 무조건 다시 예약한다.
      resumeBackupWrites({ reschedule: true });
    }
  };

  /**
   * 전체 초기화 (R-3) — 순서·검증은 core/reset이 정하고, 여기서는 상태 밖 효과를 채운다.
   *
   * 이 한 연산이 로컬 백업·클라우드 백업·권위 상태를 다 만지므로 **전체가 한 번의 획득 안**에
   * 있어야 한다. 그 획득은 쓰기 서비스가 하고, 안쪽 상태 리셋도 그 안에서 순차로 돈다 —
   * 그래서 초기화 도중 도착한 명령과 마지막 쓰기를 다투지 않는다.
   */
  const fullReset = async (): Promise<StoredState> => {
    const { result, state } = await writer.fullReset({
      suspendAutoBackup: suspendBackupWrites,
      resumeAutoBackup: ({ snapshot }) => {
        // 끝까지 간 초기화만 곧바로 다시 예약한다 — 중단 창에서 눌러 버린 예약이 사라진
        // 자리를 메우고, 그때 스냅샷되는 것은 깨끗한 default다. 실패했다면 상태가 아직
        // 옛 프로필이라 지금 예약하면 방금 지운 백업이 되살아난다. 그 경우는 예약 없이
        // 깊이만 풀고, 다음 상태 변경이 정상적으로 다시 예약하게 둔다(삭제와 다른 점).
        resumeBackupWrites({ reschedule: snapshot });
      },
      readBackupKV: deps.readBackupKV,
      removeBackupKeys: deps.removeBackupKeys,
      clearSummary: deps.clearSummary,
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
  deps.onSnapshotDeleteRequest(deleteSnapshot);

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
