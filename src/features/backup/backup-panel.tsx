import { useEffect, useState } from 'react';
import {
  backupTarget,
  decodeSnapshotText,
  lastBackupAt,
  type BackupTarget,
  type SnapshotStatus,
} from '@/core/backup';
import type { Command } from '@/core/commands';
import { parseImport } from '@/core/transfer';
import { format, MESSAGES, type MessageKey, type Translator } from '@/core/i18n';
import { hasCloudBackups, listBackupSnapshots, readBackupKV } from '@/platform/backupStore';
import type { BackupMutationResult } from '@/core/state-writer';
import { requestBackupMutation } from '@/platform/stateStore';
import { RotateCcw, Trash2 } from 'lucide-react';
import { AlertBanner } from '@/ui/alert-banner';
import { Button } from '@/ui/press-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { IconButton } from '@/ui/icon-button';
import { Pill } from '@/ui/pill';
import { ToggleSwitch } from '@/ui/toggle-switch';
import { useT } from '@/ui/i18n-context';

export interface BackupPanelProps {
  /** 클라우드 동기화 스위치 — **앞으로의** 백업 위치만 정한다 (티켓 07). */
  syncBackup: boolean;
  /** 권위 실행 결과를 돌려받는다 — 거부된 복원을 성공처럼 표시하지 않기 위해. */
  onCommand: (command: Command) => Promise<{ ok: boolean; error?: string }>;
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
async function settledMutation(
  run: () => Promise<BackupMutationResult>,
): Promise<BackupMutationResult> {
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
 * 확인 중인 행과 동작 — **한 번에 하나뿐**이다 (티켓 12). 행마다 확인 상태를 따로 들면
 * 복원 확인과 삭제 확인이 나란히 켜져, 다음 클릭이 무엇을 실행할지 화면만 봐서는 모른다.
 * 하나만 담기 때문에 다른 파괴적 동작을 켜는 것이 앞의 확인을 그대로 취소한다.
 */
type Confirming = { id: string; action: 'restore' | 'delete' };

/**
 * 백업 화면의 카드 하나 — 셋이 같은 셸을 쓴다 (티켓 09).
 *
 * `Card` 프리미티브를 그대로 조립한다. 예전에는 이 화면 전체가 접히는 패널 하나였는데, 시안이
 * 카드 넷으로 나눠 그렸다 — 접기는 없어졌다: 레일에서 이 화면으로 온 사람은 이미 백업을 보러
 * 온 것이라, 도착하자마자 펼치는 클릭이 하는 일이 없었다.
 */
function BackupCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card size="sm" className="gap-2 text-xs">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  );
}

export function BackupPanel({
  syncBackup,
  onCommand,
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
  const [snapshots, setSnapshots] = useState<SnapshotStatus[]>([]);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloudPresence, setCloudPresence] = useState<CloudPresence>('unknown');
  const [confirmingClear, setConfirmingClear] = useState(false);
  /**
   * 알림은 **목록**이다 (티켓 02에서 이월).
   *
   * 예전에는 문자열 하나였고, 복원은 `parseImport`가 돌려준 `notices`를 통째로 버렸다 —
   * 스냅샷이 퇴역 조건이나 레거시 필터를 담고 있으면 복원이 그것을 조용히 걷어 가고 사용자는
   * 아무 설명도 받지 못했다. 가져오기 경로는 같은 배열을 이미 배너로 올리고 있었으므로,
   * 없던 것은 자리뿐이었다.
   */
  const [notices, setNotices] = useState<string[]>([]);
  /** 전체 초기화의 2단계 확인 (R-3) — 파괴적이므로 한 번 더 눌러야 실행된다. */
  const [confirmingReset, setConfirmingReset] = useState(false);
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
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    setNotices([]);

    const result = await settledMutation(clearCloud);
    // 삭제는 성공을 **검증한** 결과만 성공으로 표시한다 — 실패는 배너로 드러난다.
    setError(
      result.ok
        ? null
        : `${t('cloudDeleteFailed')}: ${verifiedDeleteDetail(result, 'cloudDeleteRemaining', t)}`,
    );
    setNotices(result.ok ? [t('cloudBackupsDeleted')] : []);
    setCloudRevision((n) => n + 1);
    if (target === 'sync') void loadSnapshots(target).then(setSnapshots);
  };

  /**
   * 전체 초기화 (R-3) — 첫 클릭은 확인을 켜기만 하고, **두 번째 클릭에서만** 실행된다.
   * 실패는 어느 단계에서 멈췄는지와 함께 배너로 남는다: 다시 누르면 남은 단계만 남으므로
   * 사용자가 할 일은 "다시 누르기" 하나다(되돌리기가 아니다).
   */
  const resetEverything = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setConfirmingReset(false);
    setNotices([]);

    const result = await onCommand({ type: 'full-reset' });
    setError(result.ok ? null : `${t('resetFailed')}: ${resetFailureDetail(result.error, t)}`);
    setNotices(result.ok ? [t('resetDone')] : []);
    setCloudRevision((n) => n + 1);
    void loadSnapshots(target).then(setSnapshots, (reason) => setError(reasonText(reason)));
  };

  /** 이 행의 이 동작이 지금 확인 대기인가 — 다른 행·다른 동작이 켜지면 자동으로 거짓이 된다. */
  const isConfirming = (entry: SnapshotStatus, action: Confirming['action']) =>
    confirming?.id === entry.id && confirming.action === action;

  /**
   * 한 스냅샷만 지운다 (티켓 12) — 복원과 같은 2단계 확인을 거친다. 첫 클릭은 확인만 켜고,
   * 두 번째 클릭에서만 실행된다. 성공·실패 모두 히스토리를 다시 읽어, 지우지 못한 행이
   * 지워진 것처럼 사라지지 않는다.
   */
  const removeSnapshot = async (entry: SnapshotStatus) => {
    if (!isConfirming(entry, 'delete')) {
      setConfirming({ id: entry.id, action: 'delete' });
      return;
    }
    setConfirming(null);
    // 앞선 일괄 삭제·초기화의 성공 문구를 먼저 지운다 — 남겨 두면 이번 실패 배너 옆에
    // "삭제했습니다"가 그대로 서서, 지우지 못한 것이 지워진 것처럼 읽힌다.
    setNotices([]);

    const result = await settledMutation(() => deleteSnapshot(entry, target));
    setError(
      result.ok
        ? null
        : `${t('snapshotDeleteFailed')}: ${verifiedDeleteDetail(result, 'snapshotDeleteRemaining', t)}`,
    );
    await loadSnapshots(target).then(setSnapshots, (reason) => setError(reasonText(reason)));
  };

  const restore = async (entry: SnapshotStatus) => {
    if (!isConfirming(entry, 'restore')) {
      setConfirming({ id: entry.id, action: 'restore' });
      return;
    }
    setConfirming(null);
    setNotices([]);

    const decoded = await loadSnapshotText(entry, target);
    if (!decoded.ok) {
      setError(`Snapshot unreadable: ${decoded.reason}`);
      return;
    }
    const parsed = parseImport(decoded.text);
    if (!parsed.ok) {
      setError(parsed.errors.join('\n'));
      return;
    }
    const result = await onCommand({ type: 'restore-profiles', profiles: parsed.profiles });
    setError(result.ok ? null : (result.error ?? 'Restore rejected.'));
    /*
     * 복원이 실제로 착지했을 때만 공지를 올린다 (티켓 02에서 이월). 거부된 복원의 공지를
     * 올리면 "이것들이 걷혔습니다"라고 말해 놓고 저장소는 그대로인 화면이 된다.
     */
    if (result.ok) setNotices(parsed.notices);
  };

  const backedUpAt = lastBackupAt(snapshots);

  return (
    <>
      {error && (
        <AlertBanner as="p" severity="danger" size="xs" role="alert">
          {error}
        </AlertBanner>
      )}
      {notices.length > 0 && (
        <AlertBanner as="ul" severity="info" size="xs">
          {notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </AlertBanner>
      )}

      {/* 카드 2 — 클라우드 동기화 (R-1). 스위치는 **앞으로의** 위치만 정한다. 문구가 저장
          위치와 마지막 시각을 말하고, 클라우드 잔존 여부를 함께 붙여 끄는 것만으로 "이
          브라우저에만"이 되었다고 읽히지 않게 한다.

          **기기 수는 말하지 않는다** (티켓 AC3): 브라우저가 알려 주지 않는 값이라 셀 방법이
          없다. 말할 수 있는 것은 어디에 두는지와 마지막이 언제였는지뿐이다. */}
      <BackupCard title={t('cloudSync')}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-muted-foreground">
              {syncBackup ? t('cloudSyncOn') : t('cloudSyncOff')}
            </span>
            <span className="text-muted-foreground">
              {backedUpAt === null
                ? t('noBackupsYet')
                : format(t('lastBackupAt'), { time: new Date(backedUpAt).toLocaleString() })}
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
            variant={confirmingClear ? 'destructive' : 'ghost'}
            size="sm"
            disabled={cloudPresence === 'none'}
            aria-label={confirmingClear ? t('confirmDeleteCloudBackups') : t('deleteCloudBackups')}
            onClick={() => void deleteCloud()}
          >
            {confirmingClear ? t('confirmDeleteCloudBackups') : t('deleteCloudBackups')}
          </Button>
        </div>
      </BackupCard>

      {/* 카드 3 — 백업 히스토리 (스펙 story 76). 각 행이 시각·요약을 말하고 복원·삭제를 든다. */}
      <BackupCard title={t('backupHistory')}>
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
                ) : isConfirming(snapshot, 'restore') ? (
                  // 파괴적 확인 단계는 문구가 명시적인 텍스트 버튼을 유지한다
                  <Button
                    variant="destructive"
                    size="sm"
                    aria-label={t('ariaConfirmRestore')}
                    onClick={() => void restore(snapshot)}
                  >
                    {t('confirmReplaceAll')}
                  </Button>
                ) : (
                  <IconButton
                    label={t('ariaRestoreBackup')}
                    tooltip={t('restore')}
                    icon={RotateCcw}
                    onClick={() => void restore(snapshot)}
                  />
                )}
                {/* 삭제는 복원과 **나란히** 선다 — 복원이 막히는 손상 스냅샷도 정리할 수
                    있어야 하고(story 36), 지우는 범위는 이 행 하나뿐이다. */}
                {isConfirming(snapshot, 'delete') ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    aria-label={t('ariaConfirmDeleteBackup')}
                    onClick={() => void removeSnapshot(snapshot)}
                  >
                    {t('confirmDeleteBackup')}
                  </Button>
                ) : (
                  <IconButton
                    label={t('ariaDeleteBackup')}
                    tooltip={t('menuDelete')}
                    icon={Trash2}
                    tone="danger"
                    onClick={() => void removeSnapshot(snapshot)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </BackupCard>

      {/* 카드 4 — 전체 초기화 (R-3, 스펙 story 77). 되돌릴 수 없으므로 2단계 확인을 거친다.
          무엇이 지워지는지와 "실패해도 되돌아오지 않는다"를 누르기 전에 말한다. */}
      <BackupCard title={t('resetEverything')}>
        <p className="text-muted-foreground">{t('resetEverythingNote')}</p>
        <p className="text-muted-foreground">{t('resetRetryNote')}</p>
        <div className="flex justify-end">
          <Button
            variant={confirmingReset ? 'destructive' : 'ghost'}
            size="sm"
            aria-label={confirmingReset ? t('confirmResetEverything') : t('resetEverything')}
            onClick={() => void resetEverything()}
          >
            {confirmingReset ? t('confirmResetEverything') : t('resetEverything')}
          </Button>
        </div>
      </BackupCard>
    </>
  );
}
