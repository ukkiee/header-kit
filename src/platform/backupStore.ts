import {
  BACKUP_MANIFEST_KEY,
  backupKeys,
  backupLimits,
  backupNamespace,
  listSnapshots,
  planBackup,
  verifyBackupsCleared,
  type BackupPlan,
  type BackupTarget,
  type SnapshotStatus,
  type SyncKV,
} from '@/core/backup';

/**
 * 백업 저장소 어댑터 — 계획(core/backup)의 단계 순서만 집행한다:
 * 사전 정리 → 청크 쓰기 → 매니페스트 쓰기(커밋) → 사후 정리.
 * 이 순서가 manifest-last 원자성과 직전 정상본 보존을 만든다.
 *
 * 어느 저장소에 쓸지는 여기서 정하지 않는다 — 호출부가 `backupTarget(state)`로 정한 대상을
 * 받아 집행할 뿐이다. 스위치가 한 곳에서만 해석되어야 "껐는데 어딘가는 아직 sync"가 없다.
 */

function area(target: BackupTarget) {
  return target === 'sync' ? browser.storage.sync : browser.storage.local;
}

/**
 * 대상 저장소의 백업 네임스페이스만 읽는다. local 구역에는 권위 상태(`state`)가 함께 살아,
 * 구역을 통째로 계획에 넘기면 백업 정리가 상태를 넘볼 수 있다.
 */
export async function readBackupKV(target: BackupTarget): Promise<SyncKV> {
  return backupNamespace((await area(target).get(null)) as SyncKV);
}

/** 기존 호출부 호환 — 클라우드(sync) 구역의 백업 KV. */
export async function readSyncKV(): Promise<SyncKV> {
  return readBackupKV('sync');
}

export async function applyBackupPlan(plan: BackupPlan, target: BackupTarget): Promise<void> {
  if (plan.kind !== 'write') return;

  const store = area(target);
  if (plan.preRemoves.length > 0) {
    await store.remove(plan.preRemoves);
  }
  await store.set(plan.chunkWrites);
  await store.set({ [BACKUP_MANIFEST_KEY]: plan.manifest }); // 커밋
  if (plan.postRemoves.length > 0) {
    await store.remove(plan.postRemoves);
  }
}

export async function performBackup(
  text: string,
  profileCount: number,
  target: BackupTarget,
): Promise<BackupPlan['kind']> {
  const kv = await readBackupKV(target);
  const plan = planBackup(
    kv,
    text,
    { profileCount },
    { id: () => crypto.randomUUID(), now: () => Date.now() },
    backupLimits(target),
  );
  await applyBackupPlan(plan, target);
  return plan.kind;
}

/** 히스토리는 **활성 저장소** 것만 보여준다 — 반대쪽 스냅샷은 남아 있되 여기 섞이지 않는다. */
export async function listBackupSnapshots(target: BackupTarget): Promise<SnapshotStatus[]> {
  return listSnapshots(await readBackupKV(target));
}

/** 클라우드에 백업이 남아 있는가 — 상태 문구가 "잔존 여부"를 말할 근거. */
export async function hasCloudBackups(): Promise<boolean> {
  return backupKeys(await readBackupKV('sync')).length > 0;
}

/**
 * 클라우드 백업 삭제 — sync를 끄는 것과 **분리된** 명시적 동작이다 (R-1).
 *
 * 지웠다고 보고하기 전에 다시 읽어 검증한다. 실패를 성공처럼 표시하면 사용자는 클라우드에
 * 남은 백업을 지웠다고 믿게 되고, 그것이 이 기능이 막으려는 유일한 거짓 표시다.
 */
export type ClearCloudResult =
  | { ok: true }
  /** 잔재가 남았다 — 개수는 **파라미터**로 넘긴다. 어댑터는 로케일을 모른다. */
  | { ok: false; remaining: number }
  | { ok: false; error: string };

export async function clearCloudBackups(): Promise<ClearCloudResult> {
  try {
    const keys = backupKeys(await readBackupKV('sync'));
    if (keys.length > 0) {
      await browser.storage.sync.remove(keys);
    }
    const verified = verifyBackupsCleared(await readBackupKV('sync'));
    return verified.ok ? { ok: true } : { ok: false, remaining: verified.remaining.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
