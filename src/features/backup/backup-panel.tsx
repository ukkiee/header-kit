import { useEffect, useState } from 'react';
import { backupTarget, decodeSnapshotText, type BackupTarget, type SnapshotStatus } from '@/core/backup';
import type { Command } from '@/core/commands';
import { parseImport } from '@/core/transfer';
import { format, MESSAGES, type MessageKey, type Translator } from '@/core/i18n';
import {
  clearCloudBackups,
  deleteBackupSnapshot,
  hasCloudBackups,
  listBackupSnapshots,
  readBackupKV,
  type ClearCloudResult,
  type DeleteSnapshotResult,
} from '@/platform/backupStore';
import { RotateCcw, Trash2 } from 'lucide-react';
import { AlertBanner } from '@/ui/alert-banner';
import { Button } from '@/ui/press-button';
import { CollapsiblePanel } from '@/ui/collapsible-panel';
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
  clearCloud?: () => Promise<ClearCloudResult>;
  /** 히스토리 한 행 삭제 (티켓 12) — 일괄 삭제·전체 초기화와 **별개의** 좁은 동작이다. */
  deleteSnapshot?: (entry: SnapshotStatus, target: BackupTarget) => Promise<DeleteSnapshotResult>;
}

async function defaultLoadSnapshotText(entry: SnapshotStatus, target: BackupTarget) {
  return decodeSnapshotText(await readBackupKV(target), entry);
}

function reasonText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * 삭제 실패 사유도 카탈로그를 거친다 — 잔여 개수는 파라미터 키로 보간한다.
 * 일괄 삭제와 한 행 삭제는 남은 것이 가리키는 범위가 달라 문구 키를 갈라 받는다.
 */
function verifiedDeleteDetail(
  result: Extract<ClearCloudResult, { ok: false }>,
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

export function BackupPanel({
  syncBackup,
  onCommand,
  loadSnapshots = listBackupSnapshots,
  loadSnapshotText = defaultLoadSnapshotText,
  loadCloudPresence = hasCloudBackups,
  clearCloud = clearCloudBackups,
  deleteSnapshot = (entry, target) => deleteBackupSnapshot(entry.id, target),
}: BackupPanelProps) {
  const t = useT();
  // 처음부터 펼쳐 둔다 — 환경설정 패널과 같은 이유(레일에서 이 화면으로 온 사람은
  // 이미 백업을 보러 온 것이다).
  const [open, setOpen] = useState(true);
  const [snapshots, setSnapshots] = useState<SnapshotStatus[]>([]);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloudPresence, setCloudPresence] = useState<CloudPresence>('unknown');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 전체 초기화의 2단계 확인 (R-3) — 파괴적이므로 한 번 더 눌러야 실행된다. */
  const [confirmingReset, setConfirmingReset] = useState(false);
  /** 삭제 후 잔존 여부를 다시 읽게 하는 카운터 — 화면이 지운 사실을 스스로 확인한다. */
  const [cloudRevision, setCloudRevision] = useState(0);

  // 히스토리는 **활성 저장소** 것만 보여준다. 스위치를 되돌리면 반대쪽이 다시 보이고,
  // 어느 쪽도 지워지거나 옮겨지지 않는다 (R-1).
  const target = backupTarget({ syncBackup });

  useEffect(() => {
    if (open) void loadSnapshots(target).then(setSnapshots, (reason) => setError(reasonText(reason)));
  }, [open, loadSnapshots, target]);

  // 조회 실패를 삼키지 않는다 — 배너로 표면화하고 'unknown'으로 남겨 문구가 "없습니다"를
  // 말하지 않게 한다. deps에 활성 대상·히스토리를 넣어 토글이나 새 스냅샷 뒤에도 다시 읽는다.
  useEffect(() => {
    if (!open) return;
    void loadCloudPresence().then(
      (present) => setCloudPresence(present ? 'present' : 'none'),
      (reason) => {
        setCloudPresence('unknown');
        setError(reasonText(reason));
      },
    );
  }, [open, loadCloudPresence, cloudRevision, target, snapshots]);

  const deleteCloud = async () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    setNotice(null);

    const result = await clearCloud();
    // 삭제는 성공을 **검증한** 결과만 성공으로 표시한다 — 실패는 배너로 드러난다.
    setError(
      result.ok
        ? null
        : `${t('cloudDeleteFailed')}: ${verifiedDeleteDetail(result, 'cloudDeleteRemaining', t)}`,
    );
    setNotice(result.ok ? t('cloudBackupsDeleted') : null);
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
    setNotice(null);

    const result = await onCommand({ type: 'full-reset' });
    setError(result.ok ? null : `${t('resetFailed')}: ${resetFailureDetail(result.error, t)}`);
    setNotice(result.ok ? t('resetDone') : null);
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

    const result = await deleteSnapshot(entry, target);
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
  };

  return (
    <CollapsiblePanel
      title={t('backups')}
      open={open}
      onOpenChange={setOpen}
      toggleAriaLabel={t('ariaToggleBackups')}
      banner={
        error && (
          <AlertBanner as="p" severity="danger" size="xs" role="alert">
            {error}
          </AlertBanner>
        )
      }
    >
      <div className="mb-2 flex flex-col gap-1 text-xs">
        {/* 클라우드 동기화 (R-1) — 스위치는 **앞으로의** 위치만 정한다. 상태 문구가
            켜짐/꺼짐과 클라우드 잔존 여부를 함께 말해, 끄는 것만으로 "이 브라우저에만"이
            되었다고 읽히지 않게 한다. */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="font-medium">{t('cloudSync')}</span>
            <span className="text-muted-foreground">
              {syncBackup ? t('cloudSyncOn') : t('cloudSyncOff')}
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
        {notice && <p className="text-muted-foreground">{notice}</p>}

        {/* 전체 초기화 (R-3) — 되돌릴 수 없으므로 2단계 확인을 거친다. 무엇이 지워지는지와
            "실패해도 되돌아오지 않는다"를 누르기 전에 말한다. */}
        <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          <span className="font-medium">{t('resetEverything')}</span>
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
        </div>
      </div>

      {snapshots.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('noBackupsYet')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {snapshots.map((snapshot) => (
              <li key={snapshot.id} className="flex items-center gap-2 text-xs">
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
    </CollapsiblePanel>
  );
}
