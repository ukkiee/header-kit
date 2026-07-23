import { useEffect, useState } from 'react';
import { decodeSnapshotText, type SnapshotStatus } from '@/core/backup';
import type { Command } from '@/core/commands';
import { parseImport } from '@/core/transfer';
import { listBackupSnapshots, readSyncKV } from '@/platform/backupStore';
import { RotateCcw } from 'lucide-react';
import { Alert } from '@/ui/alert';
import { Button } from '@/ui/button';
import { CollapsiblePanel } from '@/ui/collapsible-panel';
import { IconButton } from '@/ui/icon-button';
import { Pill } from '@/ui/pill';
import { useT } from '@/ui/i18n-context';

export interface BackupPanelProps {
  /** 권위 실행 결과를 돌려받는다 — 거부된 복원을 성공처럼 표시하지 않기 위해. */
  onCommand: (command: Command) => Promise<{ ok: boolean; error?: string }>;
  loadSnapshots?: () => Promise<SnapshotStatus[]>;
  loadSnapshotText?: (
    entry: SnapshotStatus,
  ) => Promise<{ ok: true; text: string } | { ok: false; reason: string }>;
}

async function defaultLoadSnapshotText(entry: SnapshotStatus) {
  return decodeSnapshotText(await readSyncKV(), entry);
}

export function BackupPanel({
  onCommand,
  loadSnapshots = listBackupSnapshots,
  loadSnapshotText = defaultLoadSnapshotText,
}: BackupPanelProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotStatus[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) void loadSnapshots().then(setSnapshots);
  }, [open, loadSnapshots]);

  const restore = async (entry: SnapshotStatus) => {
    if (confirmingId !== entry.id) {
      setConfirmingId(entry.id);
      return;
    }
    setConfirmingId(null);

    const decoded = await loadSnapshotText(entry);
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
          <Alert as="p" severity="danger" size="xs" role="alert">
            {error}
          </Alert>
        )
      }
    >
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
                    variant="danger"
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
