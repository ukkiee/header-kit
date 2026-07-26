import { useEffect, useState } from 'react';
import { backupTarget, decodeSnapshotText, type BackupTarget, type SnapshotStatus } from '@/core/backup';
import type { Command } from '@/core/commands';
import { parseImport } from '@/core/transfer';
import {
  clearCloudBackups,
  hasCloudBackups,
  listBackupSnapshots,
  readBackupKV,
} from '@/platform/backupStore';
import { RotateCcw } from 'lucide-react';
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
  clearCloud?: () => Promise<{ ok: true } | { ok: false; error: string }>;
}

async function defaultLoadSnapshotText(entry: SnapshotStatus, target: BackupTarget) {
  return decodeSnapshotText(await readBackupKV(target), entry);
}

export function BackupPanel({
  syncBackup,
  onCommand,
  loadSnapshots = listBackupSnapshots,
  loadSnapshotText = defaultLoadSnapshotText,
  loadCloudPresence = hasCloudBackups,
  clearCloud = clearCloudBackups,
}: BackupPanelProps) {
  const t = useT();
  // 처음부터 펼쳐 둔다 — 환경설정 패널과 같은 이유(레일에서 이 화면으로 온 사람은
  // 이미 백업을 보러 온 것이다).
  const [open, setOpen] = useState(true);
  const [snapshots, setSnapshots] = useState<SnapshotStatus[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloudPresent, setCloudPresent] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 삭제 후 잔존 여부를 다시 읽게 하는 카운터 — 화면이 지운 사실을 스스로 확인한다. */
  const [cloudRevision, setCloudRevision] = useState(0);

  // 히스토리는 **활성 저장소** 것만 보여준다. 스위치를 되돌리면 반대쪽이 다시 보이고,
  // 어느 쪽도 지워지거나 옮겨지지 않는다 (R-1).
  const target = backupTarget({ syncBackup });

  useEffect(() => {
    if (open) void loadSnapshots(target).then(setSnapshots);
  }, [open, loadSnapshots, target]);

  useEffect(() => {
    if (open) void loadCloudPresence().then(setCloudPresent);
  }, [open, loadCloudPresence, cloudRevision]);

  const deleteCloud = async () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    setNotice(null);

    const result = await clearCloud();
    // 삭제는 성공을 **검증한** 결과만 성공으로 표시한다 — 실패는 배너로 드러난다.
    setError(result.ok ? null : `${t('cloudDeleteFailed')}: ${result.error}`);
    setNotice(result.ok ? t('cloudBackupsDeleted') : null);
    setCloudRevision((n) => n + 1);
    if (target === 'sync') void loadSnapshots(target).then(setSnapshots);
  };

  const restore = async (entry: SnapshotStatus) => {
    if (confirmingId !== entry.id) {
      setConfirmingId(entry.id);
      return;
    }
    setConfirmingId(null);

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
            <span className="text-zinc-500">
              {syncBackup ? t('cloudSyncOn') : t('cloudSyncOff')}
            </span>
            <span className="text-zinc-500">
              {cloudPresent ? t('cloudBackupsPresent') : t('cloudBackupsNone')}
            </span>
          </div>
          <ToggleSwitch
            checked={syncBackup}
            onCheckedChange={(enabled) => void onCommand({ type: 'set-sync-backup', enabled })}
            aria-label={t('cloudSync')}
          />
        </div>
        <p className="text-zinc-500">{t('cloudSyncKeepsHistory')}</p>

        {/* 클라우드 삭제는 스위치와 분리된 명시적 동작이다 — 자체 확인을 거친다. */}
        <div className="flex justify-end">
          <Button
            variant={confirmingClear ? 'destructive' : 'ghost'}
            size="sm"
            disabled={!cloudPresent}
            aria-label={confirmingClear ? t('confirmDeleteCloudBackups') : t('deleteCloudBackups')}
            onClick={() => void deleteCloud()}
          >
            {confirmingClear ? t('confirmDeleteCloudBackups') : t('deleteCloudBackups')}
          </Button>
        </div>
        {notice && <p className="text-zinc-500">{notice}</p>}
      </div>

      {snapshots.length === 0 ? (
        <p className="text-xs text-zinc-400">{t('noBackupsYet')}</p>
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
                ) : confirmingId === snapshot.id ? (
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
              </li>
            ))}
          </ul>
        )}
    </CollapsiblePanel>
  );
}
