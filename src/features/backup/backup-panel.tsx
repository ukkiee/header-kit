import { useEffect, useState } from 'react';
import {
  backupTarget,
  decodeSnapshotText,
  lastBackupAt,
  type BackupTarget,
  type SnapshotStatus,
} from '@/core/backup';
import type { Command } from '@/core/commands';
import type { Profile } from '@/core/schema';
import { parseImport } from '@/core/transfer';
import { importIssueText } from '@/features/transfer/import-text';
import { format, MESSAGES, type MessageKey, type Translator } from '@/core/i18n';
import { hasCloudBackups, listBackupSnapshots, readBackupKV } from '@/platform/backupStore';
import type { BackupMutationResult } from '@/core/state-writer';
import { requestBackupMutation } from '@/platform/stateStore';
import { Check, RotateCcw, Trash2 } from 'lucide-react';
import { AlertBanner } from '@/ui/alert-banner';
import { Button } from '@/ui/press-button';
import { SectionCard } from '@/ui/section-card';
import { IconButton } from '@/ui/icon-button';
import { Pill } from '@/ui/pill';
import { ToggleSwitch } from '@/ui/toggle-switch';
import { useToastManager } from '@/ui/toast';
import { useArmedConfirmSlot } from '@/ui/use-armed-confirm';
import { useT } from '@/ui/i18n-context';

export interface BackupPanelProps {
  /** 클라우드 동기화 스위치 — **앞으로의** 백업 위치만 정한다 (티켓 07). */
  syncBackup: boolean;
  /** 권위 실행 결과를 돌려받는다 — 거부된 동작을 성공처럼 표시하지 않기 위해. */
  onCommand: (command: Command) => Promise<{ ok: boolean; error?: string }>;
  /**
   * 복원 — 명령을 직접 보내지 않고 **셸을 거친다**. 되돌리기 토스트를 띄우려면 복원 직전의
   * 프로필 전체가 필요한데, 그것을 쥔 쪽은 이 패널이 아니라 셸이다(`restore` 주석).
   */
  onRestore: (profiles: Profile[]) => Promise<{ ok: boolean; error?: string }>;
  /**
   * 주입 지점 넷은 **안정된 참조**여야 한다 (code-review). 렌더마다 새로 만든 함수를 넘기면
   * 목록 로드가 매번 다시 돌고, 그 결과가 새 배열이라 잔존 여부 effect까지 함께 돌아 루프가 된다.
   * 기본값은 모듈 최상위 임포트라 그 조건을 이미 만족한다.
   */
  loadSnapshots?: (target: BackupTarget) => Promise<SnapshotStatus[]>;
  loadSnapshotText?: (
    entry: SnapshotStatus,
    target: BackupTarget,
  ) => Promise<{ ok: true; text: string } | { ok: false; reason: string }>;
  /** 클라우드에 백업이 남아 있는지 — 스위치 상태와 **별개로** 조회한다. */
  loadCloudPresence?: () => Promise<boolean>;
  clearCloud?: () => Promise<BackupMutationResult>;
  /** 히스토리 한 행 삭제 (티켓 12) — 일괄 삭제·전체 초기화와 **별개의** 좁은 동작이다. */
  deleteSnapshot?: (entry: SnapshotStatus, target: BackupTarget) => Promise<BackupMutationResult>;
}

async function defaultLoadSnapshotText(entry: SnapshotStatus, target: BackupTarget) {
  return decodeSnapshotText(await readBackupKV(target), entry);
}

function reasonText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * 변이 요청의 **거부**를 결과 객체로 바꾼다 (티켓 03 코드리뷰).
 *
 * 기본값(`requestBackupMutation`)은 이미 던지지 않지만 이 둘은 주입 지점이다. 주입된 대역이나
 * 나중에 바뀐 기본값이 던지면 `void` 호출에서 거부가 삼켜져, 확인 버튼만 되돌아오고 사용자는
 * 아무 설명도 받지 못한다 — 읽기 경로가 이미 `reasonText`로 배너에 올리는 것과 같은 처리를
 * 쓰기 경로에도 준다.
 */
async function settledMutation(run: () => Promise<BackupMutationResult>): Promise<BackupMutationResult> {
  try {
    return await run();
  } catch (reason) {
    return { ok: false, error: reasonText(reason) };
  }
}

/**
 * 삭제 실패 사유도 카탈로그를 거친다 — 잔여 개수는 파라미터 키로 보간한다.
 * 일괄 삭제와 한 행 삭제는 남은 것이 가리키는 범위가 달라 문구 키를 갈라 받는다.
 */
function verifiedDeleteDetail(
  result: Extract<BackupMutationResult, { ok: false }>,
  remainingKey: MessageKey,
  t: Translator,
) {
  return 'remaining' in result ? format(t(remainingKey), { count: result.remaining }) : result.error;
}

/** 초기화가 멈춘 단계도 카탈로그를 거친다 — background는 메시지 키로 말한다(위와 같은 결). */
function resetFailureDetail(error: string | undefined, t: Translator): string {
  return error && error in MESSAGES.en ? t(error as MessageKey) : (error ?? '');
}

/**
 * 잔존 여부는 **3상태**다 — 조회 실패를 'none'으로 접으면 잔재가 있는데도 "없습니다"를
 * 말하고 삭제 버튼까지 잠긴다. 'unknown'은 아직 못 읽었거나 조회가 실패한 상태다.
 */
type CloudPresence = 'unknown' | 'present' | 'none';

/**
 * 이 패널의 파괴적 동작 셋을 가리키는 값 — **한 무장을 셋이 나눠 갖는다.**
 *
 * "한 번에 하나뿐"은 원래 히스토리 행들 사이에서만 참이었고, 클라우드 삭제와 전체 초기화는
 * 각자 자기 상태를 들고 있어 **셋이 동시에 무장할 수 있었다**(실측: "전부 지울까요?"와
 * "클라우드에서 지울까요?"가 나란히 선 화면). 슬롯 하나로 합치면 그 자리가 사라진다 —
 * 다음 클릭이 무엇을 실행할지 화면에 선 되물음 하나가 답한다.
 *
 * **복원은 여기 없다.** 되물음 대신 실행 취소 토스트를 쓰기 때문이다(아래 `restore` 주석).
 */
type ConfirmTarget = `snapshot:${string}` | 'cloud' | 'reset';

export function BackupPanel({
  syncBackup,
  onCommand,
  onRestore,
  loadSnapshots = listBackupSnapshots,
  loadSnapshotText = defaultLoadSnapshotText,
  loadCloudPresence = hasCloudBackups,
  // 두 변이 모두 **서비스워커에 요청한다** — 문은 하나이고, 근거는 `requestBackupMutation`에
  // 있다. 읽기는 화면에 남는다(목록·잔존 여부·본문 로드) — D7.
  //
  // prop 시그니처는 바뀌지 않는다: 바뀐 것은 기본값이 요청 호출이 됐다는 것뿐이라, 잔여 개수가
  // 여기까지 그대로 도착하고 테스트가 대역을 주입하는 방식도 그대로 성립한다.
  clearCloud = () => requestBackupMutation({ op: 'clear-cloud' }),
  deleteSnapshot = (entry, target) =>
    requestBackupMutation({ op: 'delete-snapshot', snapshotId: entry.id, target }),
}: BackupPanelProps) {
  const t = useT();
  /**
   * 끝난 일을 알리는 쪽지 — **성공과 실패가 둘 다 여기로 간다** (사용자 결정).
   *
   * 한때 실패는 배너에 남겼다. 근거 셋 중 첫째("셸이 조건 없이 초록이라 실패가 성공처럼
   * 보인다")가 셸을 고치며 사라졌고, 나머지 둘은 **실패 토스트의 규칙**이 됐다:
   * 잘리지 않고, 스스로 사라지지 않으며, 그래서 닫는 버튼을 든다(`ui/toaster.tsx`).
   *
   * **여기 오는 것은 파괴적 동작의 결과뿐이다.** 읽기 실패(목록 로드·클라우드 잔존 조회)는
   * 누른 것에 대한 답이 아니라 **화면이 지금 어떤 상태인가**를 말하므로 배너에 남는다 —
   * 쪽지로 띄우면 읽고 닫는 순간 그 사실이 화면에서 사라진다.
   */
  const toast = useToastManager();

  /** 실패 쪽지 — 사라지지 않고(`timeout: 0`) 닫는 이름을 함께 싣는다(셸은 카탈로그 밖이다). */
  const failureToast = (title: string) =>
    toast.add({ title, type: 'error', timeout: 0, data: { closeLabel: t('dismiss') } });
  const [snapshots, setSnapshots] = useState<SnapshotStatus[]>([]);
  /**
   * 되물음 하나 — 셋이 나눠 갖는다. 시간이 지나면 스스로 풀리고 Escape로도 풀린다
   * (근거는 `useArmedConfirm`). 그 자동 해제가 없던 시절에는 무장한 채 잊힌 버튼이
   * 무기한 남았고, 특히 탭 화면은 팝업과 달리 닫히지 않아 며칠을 살 수 있었다.
   */
  const confirm = useArmedConfirmSlot<ConfirmTarget>();
  /**
   * 배너에 서는 오류 — **읽기 실패와 복원**만 남는다.
   *
   * 파괴적 동작의 실패는 빨간 쪽지로 갔다(위 `failureToast`). 여기 남는 둘의 공통점은
   * **누른 것에 대한 답이 아니라 화면이 지금 어떤 상태인가**를 말한다는 것이다 —
   * 목록을 못 읽었다면 그 목록이 비어 보이는 이유가 이 문장이고, 복원이 거부됐다면 화면에
   * 남아 있는 것이 옛 프로필이라는 뜻이다. 쪽지로 띄우면 닫는 순간 그 사실이 사라진다.
   */
  const [error, setError] = useState<string | null>(null);
  const [cloudPresence, setCloudPresence] = useState<CloudPresence>('unknown');
  /**
   * 알림은 **목록**이다 (티켓 02에서 이월).
   *
   * 예전에는 문자열 하나였고, 복원은 `parseImport`가 돌려준 `notices`를 통째로 버렸다 —
   * 스냅샷이 퇴역 조건이나 레거시 필터를 담고 있으면 복원이 그것을 조용히 걷어 가고 사용자는
   * 아무 설명도 받지 못했다. 가져오기 경로는 같은 배열을 이미 배너로 올리고 있었으므로,
   * 없던 것은 자리뿐이었다.
   *
   * **지금 여기 오는 것은 복원의 공지뿐이다** — 클라우드 삭제·초기화의 성공 문구는 토스트로
   * 옮겼다(위 `toast` 주석). 복원의 공지는 "무엇이 걷혔는가"를 말하므로 읽고 나서도 화면에
   * 남아 있어야 하고, 한 번의 복원이 여러 개를 낸다. 그래서 이것만 목록으로 남는다.
   */
  const [notices, setNotices] = useState<string[]>([]);
  /** 삭제 후 잔존 여부를 다시 읽게 하는 카운터 — 화면이 지운 사실을 스스로 확인한다. */
  const [cloudRevision, setCloudRevision] = useState(0);

  // 히스토리는 **활성 저장소** 것만 보여준다. 스위치를 되돌리면 반대쪽이 다시 보이고,
  // 어느 쪽도 지워지거나 옮겨지지 않는다 (R-1).
  const target = backupTarget({ syncBackup });

  useEffect(() => {
    void loadSnapshots(target).then(setSnapshots, (reason) => setError(reasonText(reason)));
  }, [loadSnapshots, target]);

  // 조회 실패를 삼키지 않는다 — 배너로 표면화하고 'unknown'으로 남겨 문구가 "없습니다"를
  // 말하지 않게 한다. deps에 활성 대상·히스토리를 넣어 토글이나 새 스냅샷 뒤에도 다시 읽는다.
  useEffect(() => {
    void loadCloudPresence().then(
      (present) => setCloudPresence(present ? 'present' : 'none'),
      (reason) => {
        setCloudPresence('unknown');
        setError(reasonText(reason));
      },
    );
  }, [loadCloudPresence, cloudRevision, target, snapshots]);

  const deleteCloud = async () => {
    setNotices([]);

    const result = await settledMutation(clearCloud);
    // 삭제는 성공을 **검증한** 결과만 성공으로 표시한다 — 실패는 빨간 쪽지로 드러난다.
    if (result.ok) toast.add({ title: t('cloudBackupsDeleted') });
    else
      failureToast(`${t('cloudDeleteFailed')}: ${verifiedDeleteDetail(result, 'cloudDeleteRemaining', t)}`);
    setCloudRevision((n) => n + 1);
    if (target === 'sync') void loadSnapshots(target).then(setSnapshots);
  };

  /**
   * 전체 초기화 (R-3) — 첫 클릭은 확인을 켜기만 하고, **두 번째 클릭에서만** 실행된다.
   * 실패는 어느 단계에서 멈췄는지와 함께 배너로 남는다: 다시 누르면 남은 단계만 남으므로
   * 사용자가 할 일은 "다시 누르기" 하나다(되돌리기가 아니다).
   */
  const resetEverything = async () => {
    setNotices([]);

    const result = await onCommand({ type: 'full-reset' });
    if (result.ok) toast.add({ title: t('resetDone') });
    else failureToast(`${t('resetFailed')}: ${resetFailureDetail(result.error, t)}`);
    setCloudRevision((n) => n + 1);
    void loadSnapshots(target).then(setSnapshots, (reason) => setError(reasonText(reason)));
  };

  /** 이 행이 지금 확인 대기인가 — 다른 행·다른 동작이 켜지면 슬롯이 하나라 저절로 거짓이 된다. */
  const snapshotTarget = (entry: SnapshotStatus): ConfirmTarget => `snapshot:${entry.id}`;

  /**
   * 한 스냅샷만 지운다 (티켓 12) — 복원과 같은 2단계 확인을 거친다. 첫 클릭은 확인만 켜고,
   * 두 번째 클릭에서만 실행된다. 성공·실패 모두 히스토리를 다시 읽어, 지우지 못한 행이
   * 지워진 것처럼 사라지지 않는다.
   */
  const removeSnapshot = async (entry: SnapshotStatus) => {
    // 앞선 복원의 공지를 먼저 지운다 — 남겨 두면 이번 실패 배너 옆에 지난 복원의 설명이
    // 그대로 서서, 이번 동작이 낸 말처럼 읽힌다.
    setNotices([]);

    const result = await settledMutation(() => deleteSnapshot(entry, target));
    // 성공에는 쪽지를 두지 않는다 — 그 행이 사라지는 것이 곧 답이다. 실패만 말한다.
    if (!result.ok) {
      failureToast(
        `${t('snapshotDeleteFailed')}: ${verifiedDeleteDetail(result, 'snapshotDeleteRemaining', t)}`,
      );
    }
    await loadSnapshots(target).then(setSnapshots, (reason) => setError(reasonText(reason)));
  };

  /**
   * 복원 — **누르면 바로 실행되고, 되돌리기는 토스트가 든다** (규칙 삭제와 같은 결).
   *
   * 예전에는 2단 확인이었다. 파괴적이라는 판단은 맞지만 되물음은 값이 싸지 않다: 복원은
   * 사고가 나면 되돌릴 수 있는 동작인데(직전 프로필 전체를 다시 심으면 된다) 되물음은 매번
   * 두 번 누르게 한다. 되돌릴 수 없는 것(삭제·초기화)에만 되물음을 남기고, 되돌릴 수 있는
   * 것은 즉시 실행 + 실행 취소로 옮긴다.
   *
   * 실행 취소는 **셸이 든다**(`onRestore`). 되돌리려면 복원 직전의 프로필 전체가 필요한데
   * 이 패널은 그것을 보지 못한다 — 스냅샷을 쥔 쪽이 토스트도 띄우는 것이 맞다.
   */
  const restore = async (entry: SnapshotStatus) => {
    confirm.disarm();
    setNotices([]);

    const decoded = await loadSnapshotText(entry, target);
    if (!decoded.ok) {
      setError(`Snapshot unreadable: ${decoded.reason}`);
      return;
    }
    const parsed = parseImport(decoded.text);
    if (!parsed.ok) {
      setError(parsed.errors.map((e) => importIssueText(e, t)).join('\n'));
      return;
    }
    const result = await onRestore(parsed.profiles);
    setError(result.ok ? null : (result.error ?? 'Restore rejected.'));
    /*
     * 복원이 실제로 착지했을 때만 공지를 올린다 (티켓 02에서 이월). 거부된 복원의 공지를
     * 올리면 "이것들이 걷혔습니다"라고 말해 놓고 저장소는 그대로인 화면이 된다.
     */
    if (result.ok) setNotices(parsed.notices.map((n) => importIssueText(n, t)));
  };

  const backedUpAt = lastBackupAt(snapshots);
  /*
   * 시각은 **지금 활성 저장소**의 것이다 — 히스토리 카드가 보여 주는 그 목록에서 나온다.
   * 그래서 문구가 저장소를 밝힌다: 밝히지 않으면 동기화를 끈 직후 로컬이 비었을 때
   * "아직 백업 없음" 아래에 "클라우드에 백업이 남아 있습니다"가 나란히 서서 카드가
   * 자기모순을 말한다 (code-review).
   */
  const storeName = t(target === 'sync' ? 'storeCloud' : 'storeLocal');

  return (
    <>
      {error && (
        <AlertBanner as="p" severity="danger" size="xs" role="alert">
          {error}
        </AlertBanner>
      )}
      {notices.length > 0 && (
        <AlertBanner as="ul" severity="info" size="xs">
          {notices.map((notice, index) => (
            // 같은 문구가 둘일 수 있다 — 프로필 이름이 같은 두 항목이 같은 공지를 낸다.
            <li key={`${index}-${notice}`}>{notice}</li>
          ))}
        </AlertBanner>
      )}

      {/* 카드 2 — 클라우드 동기화 (R-1). 스위치는 **앞으로의** 위치만 정한다. 문구가 저장
          위치와 마지막 시각을 말하고, 클라우드 잔존 여부를 함께 붙여 끄는 것만으로 "이
          브라우저에만"이 되었다고 읽히지 않게 한다.

          **기기 수는 말하지 않는다** (티켓 AC3): 브라우저가 알려 주지 않는 값이라 셀 방법이
          없다. 말할 수 있는 것은 어디에 두는지와 마지막이 언제였는지뿐이다. */}
      <SectionCard title={t('cloudSync')}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-muted-foreground">{syncBackup ? t('cloudSyncOn') : t('cloudSyncOff')}</span>
            <span className="text-muted-foreground">
              {backedUpAt === null
                ? format(t('lastBackupNever'), { store: storeName })
                : format(t('lastBackupAt'), {
                    store: storeName,
                    time: new Date(backedUpAt).toLocaleString(),
                  })}
            </span>
            <span className="text-muted-foreground">
              {cloudPresence === 'present'
                ? t('cloudBackupsPresent')
                : cloudPresence === 'none'
                  ? t('cloudBackupsNone')
                  : t('cloudBackupsUnknown')}
            </span>
          </div>
          <ToggleSwitch
            checked={syncBackup}
            onCheckedChange={(enabled) => void onCommand({ type: 'set-sync-backup', enabled })}
            aria-label={t('cloudSync')}
          />
        </div>
        <p className="text-muted-foreground">{t('cloudSyncKeepsHistory')}</p>

        {/* 클라우드 삭제는 스위치와 분리된 명시적 동작이다 — 자체 확인을 거친다. */}
        <div className="flex justify-end">
          <Button
            variant={confirm.isArmed('cloud') ? 'destructive' : 'ghost'}
            size="sm"
            disabled={cloudPresence === 'none'}
            aria-label={confirm.isArmed('cloud') ? t('confirmDeleteCloudBackups') : t('deleteCloudBackups')}
            onClick={() => confirm.press('cloud', () => void deleteCloud())}
          >
            {confirm.isArmed('cloud') ? t('confirmDeleteCloudBackups') : t('deleteCloudBackups')}
          </Button>
        </div>
      </SectionCard>

      {/* 카드 3 — 백업 히스토리 (스펙 story 76). 각 행이 시각·요약을 말하고 복원·삭제를 든다. */}
      <SectionCard title={t('backupHistory')}>
        {snapshots.length === 0 ? (
          <p className="text-muted-foreground">{t('noBackupsYet')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id} className="flex items-center gap-2">
                <span className="flex-1">
                  {new Date(snapshot.createdAt).toLocaleString()} · {snapshot.profileCount}{' '}
                  {snapshot.profileCount === 1 ? t('activeProfile') : t('activeProfiles')}
                </span>
                {snapshot.status === 'corrupt' ? (
                  <Pill tone="danger" title={snapshot.reason}>
                    {t('corrupt')}
                  </Pill>
                ) : (
                  // 되물음 없이 바로 복원한다 — 되돌리기는 토스트가 든다(위 `restore` 주석).
                  <IconButton
                    label={t('ariaRestoreBackup')}
                    tooltip={t('restore')}
                    icon={RotateCcw}
                    onClick={() => void restore(snapshot)}
                  />
                )}
                {/* 삭제는 복원과 **나란히** 선다 — 복원이 막히는 손상 스냅샷도 정리할 수
                    있어야 하고(story 36), 지우는 범위는 이 행 하나뿐이다.

                    **되물음도 아이콘이다** — 프로필 삭제와 같은 규약이다(`profile-dot.tsx`의
                    같은 자리). 예전에는 무장하면 "이 백업을 지울까요?" 텍스트 버튼으로 바뀌었는데,
                    그러면 아이콘 하나가 낱말 덩어리로 부풀어 옆의 복원 아이콘을 밀어낸다 — 같은
                    되물음인데 프로필 행에서는 자리가 그대로이고 여기서는 행이 흔들렸다.

                    아이콘이 **모양으로도** 바뀌므로(휴지통 → 체크) 무장 여부가 색각에 매이지
                    않고, 되물음 문구(`confirmDeleteBackup`)는 툴팁이 그대로 나른다. 접근성
                    이름 둘은 바뀌지 않는다 — 스모크가 그 이름으로 이 버튼을 찾는다. */}
                <IconButton
                  label={
                    confirm.isArmed(snapshotTarget(snapshot))
                      ? t('ariaConfirmDeleteBackup')
                      : t('ariaDeleteBackup')
                  }
                  tooltip={
                    confirm.isArmed(snapshotTarget(snapshot)) ? t('confirmDeleteBackup') : t('menuDelete')
                  }
                  icon={confirm.isArmed(snapshotTarget(snapshot)) ? Check : Trash2}
                  tone="danger"
                  onClick={() => confirm.press(snapshotTarget(snapshot), () => void removeSnapshot(snapshot))}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 카드 4 — 전체 초기화 (R-3, 스펙 story 77). 되돌릴 수 없으므로 2단계 확인을 거친다.
          무엇이 지워지는지와 "실패해도 되돌아오지 않는다"를 누르기 전에 말한다. */}
      <SectionCard title={t('resetEverything')}>
        <p className="text-muted-foreground">{t('resetEverythingNote')}</p>
        <p className="text-muted-foreground">{t('resetRetryNote')}</p>
        <div className="flex justify-end">
          <Button
            variant={confirm.isArmed('reset') ? 'destructive' : 'ghost'}
            size="sm"
            aria-label={confirm.isArmed('reset') ? t('confirmResetEverything') : t('resetEverything')}
            onClick={() => confirm.press('reset', () => void resetEverything())}
          >
            {confirm.isArmed('reset') ? t('confirmResetEverything') : t('resetEverything')}
          </Button>
        </div>
      </SectionCard>
    </>
  );
}
