import {
  BACKUP_MANIFEST_KEY,
  backupKeys,
  backupLimits,
  backupNamespace,
  listSnapshots,
  planBackup,
  planSnapshotDelete,
  verifyBackupsCleared,
  verifySnapshotDeleteComplete,
  type BackupPlan,
  type BackupTarget,
  type SnapshotStatus,
  type SyncKV,
} from '@/core/backup';
import type { DeleteSnapshotResult as CoreDeleteSnapshotResult } from '@/core/state-writer';
import type { WritePermit } from '@/core/writer-lane';

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

/**
 * 지정한 키만 지운다 — 구역을 비우지 않는다. 무엇을 지울지는 호출부가 `backupKeys`로
 * 정하므로, local 구역의 권위 상태(`state`)가 삭제에 휩쓸릴 자리가 없다 (전체 초기화 R-3).
 *
 * Writer Lane의 쓰기 허가를 요구한다 (티켓 02). `bk:` 매니페스트는 통째로 교체되므로 겹친
 * 두 쓰기가 서로의 결과를 지운다 — 그것이 릴리스 r3의 R-3이었고, 레인이 그 창을 닫는다.
 */
export async function removeBackupKeys(
  permit: WritePermit,
  target: BackupTarget,
  keys: string[],
): Promise<void> {
  permit.assertLive();
  if (keys.length === 0) return;
  await area(target).remove(keys);
}

export async function applyBackupPlan(
  permit: WritePermit,
  plan: BackupPlan,
  target: BackupTarget,
): Promise<void> {
  if (plan.kind !== 'write') return;

  permit.assertLive();
  const store = area(target);
  if (plan.preRemoves.length > 0) {
    await store.remove(plan.preRemoves);
  }
  await store.set(plan.chunkWrites);
  // 커밋 직전에 한 번 더 본다 (ADR 0016: 진입 시점 + 쓰기 직전). 위 두 await 동안 이 작업이
  // 끝났다면 이 커밋은 레인이 다음 작업으로 넘어간 뒤에 착지한다 — 매니페스트 커밋은 통째
  // 교체라 그 착지가 그 사이 확정된 목록을 지운다.
  permit.assertLive();
  await store.set({ [BACKUP_MANIFEST_KEY]: plan.manifest }); // 커밋
  if (plan.postRemoves.length > 0) {
    await store.remove(plan.postRemoves);
  }
}

/** 자동 Backup 한 번 — 레인 안에서만 돈다 (티켓 02). */
export async function performBackup(
  permit: WritePermit,
  text: string,
  profileCount: number,
  target: BackupTarget,
): Promise<BackupPlan['kind']> {
  permit.assertLive();
  const kv = await readBackupKV(target);
  const plan = planBackup(
    kv,
    text,
    { profileCount },
    { id: () => crypto.randomUUID(), now: () => Date.now() },
    backupLimits(target),
  );
  await applyBackupPlan(permit, plan, target);
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

/**
 * 히스토리 한 행 삭제 (티켓 12) — 일괄 삭제(위)와 **다른 동작**이다. 지우는 것은 그
 * 스냅샷뿐이고, 대상은 언제나 호출부가 정한 활성 저장소 하나다.
 *
 * 순서는 **매니페스트 먼저, 청크 나중**이다(쓰기의 manifest-last와 거울상). 중간에 끊기면
 * 남는 것은 목록에 없는 고아 청크뿐이고 그건 다음 `planBackup`이 정리한다. 반대로 청크를
 * 먼저 지우면 매니페스트에 살아 있는 항목의 청크가 사라져, 지웠다는 행이 '손상됨'으로
 * 되살아난다.
 */
/**
 * 삭제 결과의 이름은 `core/state-writer`에 있다 — 화면이 그리는 값이므로 계약 층에 사는 것이
 * 맞고, 두 곳에 같은 모양을 따로 적어 두면 곧 어긋난다 (티켓 02 코드리뷰).
 */
export type { DeleteSnapshotResult } from '@/core/state-writer';

export async function deleteBackupSnapshot(
  permit: WritePermit,
  snapshotId: string,
  target: BackupTarget,
): Promise<CoreDeleteSnapshotResult> {
  try {
    permit.assertLive();
    const before = await readBackupKV(target);
    const plan = planSnapshotDelete(before, snapshotId);
    // 매니페스트에 없으면 커밋할 것이 없다 — 이미 지운 행을 다시 지워도 무해하다(멱등).
    // 잔여 청크는 그 경우에도 정리한다.
    if (plan.found) {
      permit.assertLive();
      await area(target).set({ [BACKUP_MANIFEST_KEY]: plan.manifest });
    }
    await removeBackupKeys(permit, target, plan.removeKeys);
    // 검증은 **읽은 시점의 KV와 함께** 본다 (release R2-3) — 매니페스트를 통째로 쓰는
    // 동작을 "지운 id가 없다"는 부분 술어로만 검사하면, 그 사이 커밋된 스냅샷이 우리
    // 쓰기에 지워진 것을 성공으로 접는다. 경합 자체는 이제 레인이 닫고(허가를 요구하므로
    // 겹친 삭제가 성립하지 않는다), 이 검증은 마지막 그물이다.
    const verified = verifySnapshotDeleteComplete(before, await readBackupKV(target), snapshotId);
    return verified.ok ? { ok: true } : { ok: false, remaining: verified.remaining.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

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
