import {
  BACKUP_MANIFEST_KEY,
  listSnapshots,
  planBackup,
  type BackupPlan,
  type SnapshotStatus,
  type SyncKV,
} from '@/core/backup';

/**
 * storage.sync 어댑터 — 계획(core/backup)의 단계 순서만 집행한다:
 * 사전 정리 → 청크 쓰기 → 매니페스트 쓰기(커밋) → 사후 정리.
 * 이 순서가 manifest-last 원자성과 직전 정상본 보존을 만든다.
 */

export async function readSyncKV(): Promise<SyncKV> {
  return browser.storage.sync.get(null) as Promise<SyncKV>;
}

export async function applyBackupPlan(plan: BackupPlan): Promise<void> {
  if (plan.kind !== 'write') return;

  if (plan.preRemoves.length > 0) {
    await browser.storage.sync.remove(plan.preRemoves);
  }
  await browser.storage.sync.set(plan.chunkWrites);
  await browser.storage.sync.set({ [BACKUP_MANIFEST_KEY]: plan.manifest }); // 커밋
  if (plan.postRemoves.length > 0) {
    await browser.storage.sync.remove(plan.postRemoves);
  }
}

export async function performBackup(
  text: string,
  profileCount: number,
): Promise<BackupPlan['kind']> {
  const kv = await readSyncKV();
  const plan = planBackup(kv, text, { profileCount }, {
    id: () => crypto.randomUUID(),
    now: () => Date.now(),
  });
  await applyBackupPlan(plan);
  return plan.kind;
}

export async function listBackupSnapshots(): Promise<SnapshotStatus[]> {
  return listSnapshots(await readSyncKV());
}
