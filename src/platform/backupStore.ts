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
import type { BackupMutationResult } from '@/core/state-writer';
import type { WritePermit } from '@/core/writer-lane';

/**
 * 백업 저장소 어댑터 — 두 가지를 한다.
 *
 * **쓰기**: 계획(core/backup)의 단계 순서를 집행한다 — 사전 정리 → 청크 쓰기 →
 * 매니페스트 쓰기(커밋) → 사후 정리. 이 순서가 manifest-last 원자성과 직전 정상본 보존을
 * 만든다. 모든 쓰기는 Writer Lane의 허가를 요구한다 (ADR 0016).
 *
 * **읽기**: 목록 조회에 축출 중 읽기 펜스가 붙는다 (티켓 04) — 쓰기 규약은 건드리지 않고,
 * 사전 정리가 커밋 앞에 만드는 창을 읽기 쪽에서 지난다. 근거는 `listBackupSnapshots`에 있다.
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

/**
 * 매니페스트 키의 변경을 구독한다 — 권위 상태·세션 요약의 구독 헬퍼와 같은 결이다 (티켓 04).
 *
 * 두 가지가 다르다. **구독 해제를 돌려준다**: 그 둘은 앱 수명 동안 사는 구독이고 이것은 읽기
 * 한 번의 펜스가 열었다 닫는 구독이라, 돌려주지 않으면 히스토리를 열 때마다 리스너가 쌓인다.
 * 그리고 **내보내지 않는다**: 이 모듈 밖에 부를 곳이 없다.
 */
function onBackupManifestChanged(target: BackupTarget, listener: () => void): () => void {
  const handler = (changes: Record<string, unknown>, area: string): void => {
    if (area === target && BACKUP_MANIFEST_KEY in changes) listener();
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}

/**
 * 축출이 만드는 창을 지나기 위한 펜스의 유계 시간 (티켓 04, D7).
 *
 * 기다리는 대상은 `applyBackupPlan`의 사전 정리와 매니페스트 커밋 사이의 창이다. 그 둘은 같은
 * 작업 안의 연속된 await지만, `storage.sync`는 분당 쓰기 횟수를 제한하므로 커밋이 밀릴 수 있다.
 *
 * 짧게 잡을 때의 실패는 **멀쩡한 Backup을 손상으로 그리는 것** — 이 티켓이 없애러 온 바로 그
 * 화면이다. 길게 잡을 때의 비용은 목록이 늦게 그려지는 것이고, 그 비용은 **불일치로 보이는
 * 읽기에서만** 든다(정합한 읽기는 펜스를 아예 열지 않는다). 그래서 후자를 고른다.
 */
export const MANIFEST_FENCE_MS = 1_000;

/**
 * 히스토리는 **활성 저장소** 것만 보여준다 — 반대쪽 스냅샷은 남아 있되 여기 섞이지 않는다.
 *
 * ## 축출 중 읽기 펜스 (티켓 04, D7)
 *
 * 백업 계획의 **사전 정리**는 링에서 밀려나는 항목의 청크를 지우고, 그 청크들은 아직 커밋된 옛
 * 매니페스트가 열거하고 있다. 사전 정리는 매니페스트 교체보다 **먼저** 일어나므로 그 사이에
 * 읽으면 목록에는 있고 데이터는 없는 항목을 보게 되어, 멀쩡한 Backup이 '손상됨'으로 그려진다.
 *
 * 불일치를 보면 재시도 횟수를 세지 않고 **매니페스트 변경을 유계 시간 동안 기다렸다가** 다시
 * 읽는다. 단순 재시도로는 안 된다: 사전 정리가 끝나고 쓰기가 커밋 앞에서 멈춘 사이에 **두 읽기가
 * 모두** 드는 순서가 존재하고, 그러면 두 번째 읽기도 옛 매니페스트를 보아 같은 오판을 낸다.
 *
 * **구독을 첫 읽기보다 먼저 연다** (티켓 04 코드리뷰). 읽은 뒤에 열면 그 사이에 착지한 커밋의
 * 이벤트를 놓쳐 유계 시간을 통째로 태우고, 정합해진 저장소를 손상으로 보고한다. 쓰기는 서비스
 * 워커에 있고 읽기는 화면에 있으므로 그 틈은 프로세스 간 지연이지 이론적 창이 아니다.
 *
 * 기제는 이것 **하나**다. 시간 초과 뒤에 한 번 더 읽는 보강도 생각했지만, 구독이 읽기보다
 * 먼저 열려 있으면 매니페스트가 바뀌는 모든 경로가 이벤트를 내므로 그 재읽기가 살릴 수 있는
 * 경우가 없다 — 그리고 그것을 두면 구독을 늦게 여는 구현과 결과가 같아져, 이 성질을 테스트가
 * 값으로 구분할 수 없게 된다.
 *
 * 쓰기 규약은 한 줄도 건드리지 않는다. 사전 정리를 커밋 뒤로 미루는 대안은 물렸다 — 사전
 * 정리의 존재 이유가 공간 확보이고, 미루면 새 청크를 쓸 자리가 없어 **없던 quota 실패를 만든다.**
 */
export async function listBackupSnapshots(
  target: BackupTarget,
  fenceMs: number = MANIFEST_FENCE_MS,
): Promise<SnapshotStatus[]> {
  let changed = false;
  let wake: (() => void) | null = null;
  // 첫 읽기 **전에** 연다 — 읽기와 구독 사이에 착지한 커밋을 놓치지 않기 위해서다.
  const unsubscribe = onBackupManifestChanged(target, () => {
    changed = true;
    wake?.();
  });
  try {
    const first = listSnapshots(await readBackupKV(target));
    if (!first.some((entry) => entry.status === 'corrupt')) return first;

    if (!changed) {
      // 유계 시간 동안만 기다린다 — 사전 정리 뒤에 워커가 종료돼 커밋이 영영 오지 않는 순서가
      // 존재하고, 그때는 기다림을 끝내고 판정해야 한다.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, fenceMs);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    // 시간이 다했는데 변경이 없었다면 그 시점의 저장소는 정말로 불일치다 — 손상 판정이 사실상
    // 옳고, 다음 백업 계획의 self-healing이 그 항목을 치운다.
    if (!changed) return first;
    // 변경이 왔다: 새 매니페스트로 다시 판정한다. 축출이 끝난 매니페스트는 그 항목을 더는
    // 열거하지 않으므로 정합하다.
    return listSnapshots(await readBackupKV(target));
  } finally {
    unsubscribe();
  }
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
export type { BackupMutationResult as ClearCloudResult } from '@/core/state-writer';

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
 * 두 이름 다 계약 층(`core/state-writer`)의 `BackupMutationResult` 하나를 가리킨다 — 화면이
 * 그리는 값이므로 계약 층에 살고, 같은 모양을 여기 따로 적어 두면 곧 어긋난다.
 * 옛 이름을 남기는 이유는 백업 패널의 prop 시그니처가 그것을 쓰기 때문이다.
 */
export type { DeleteSnapshotResult } from '@/core/state-writer';

export async function deleteBackupSnapshot(
  permit: WritePermit,
  snapshotId: string,
  target: BackupTarget,
): Promise<BackupMutationResult> {
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

/**
 * Writer Lane의 쓰기 허가를 요구한다 (티켓 03). 티켓 03 이전에는 이 함수가 **화면에서** 직접
 * 불렸고, 그래서 `bk:` writer가 두 실행 컨텍스트에 서 있었다 — 서비스워커의 자동 Backup과
 * 화면의 삭제가 서로를 모른 채 같은 네임스페이스를 고쳤다. 릴리스 r3의 R-3 중 남은 절반이 이것이고,
 * 허가를 요구하는 것이 "서비스워커가 유일한 writer"를 규약에서 **배선의 사실**로 바꾼다.
 */
export async function clearCloudBackups(permit: WritePermit): Promise<BackupMutationResult> {
  try {
    permit.assertLive();
    const keys = backupKeys(await readBackupKV('sync'));
    if (keys.length > 0) {
      // 쓰기 직전에 다시 본다 (ADR 0016: 진입 시점 + 쓰기 직전) — 위 읽기를 기다리는 동안
      // 이 작업이 끝났다면 이 삭제는 레인이 다음 작업으로 넘어간 뒤에 착지한다.
      permit.assertLive();
      await browser.storage.sync.remove(keys);
    }
    const verified = verifyBackupsCleared(await readBackupKV('sync'));
    return verified.ok ? { ok: true } : { ok: false, remaining: verified.remaining.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
