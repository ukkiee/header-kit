import { useEffect, useState } from 'react';
import { decodeSnapshotText, type SnapshotStatus } from '@/core/backup';
import type { Command } from '@/core/commands';
import { parseImport } from '@/core/transfer';
import { listBackupSnapshots, readSyncKV } from '@/platform/backupStore';
import { Button } from './Button';
import { useT } from './i18n-context';

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
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-zinc-400">{t('backups')}</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" aria-label="Toggle backups" onClick={() => setOpen(!open)}>
          {open ? t('hide') : t('show')}
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {open &&
        (snapshots.length === 0 ? (
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
                  <span
                    className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700 dark:bg-red-950 dark:text-red-300"
                    title={snapshot.reason}
                  >
                    {t('corrupt')}
                  </span>
                ) : (
                  <Button
                    variant={confirmingId === snapshot.id ? 'danger' : 'ghost'}
                    size="sm"
                    aria-label={confirmingId === snapshot.id ? 'Confirm restore' : 'Restore backup'}
                    onClick={() => void restore(snapshot)}
                  >
                    {confirmingId === snapshot.id ? t('confirmReplaceAll') : t('restore')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
