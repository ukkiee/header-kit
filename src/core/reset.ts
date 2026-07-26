import { backupKeys, verifyBackupsCleared, type BackupTarget, type SyncKV } from './backup';

/**
 * 전체 초기화 (R-3) — **설계상 파괴적**이다.
 *
 * 저널·롤백으로 원자성을 흉내내지 않는다. 삭제는 되돌릴 수 없고, 되돌리는 척하는 기계는
 * v0.1.0에 과설계다. 대신 모든 단계를 **멱등**하게 만들어, 중간에 실패해도 사용자가 다시
 * 눌러 남은 단계를 끝까지 밀 수 있게 한다. 이 모듈은 그 순서와 검증만 정하고, 저장소를
 * 실제로 만지는 일은 주입된 효과가 한다 (backup.ts의 계획/집행 분리와 같은 결).
 */

/** 실패를 어느 단계에서 멈췄는지로 말한다 — 다시 누를 때 무엇이 남았는지가 그대로 읽힌다. */
export type ResetStep =
  | 'clear-local-backups'
  | 'clear-sync-backups'
  | 'reset-state'
  | 'clear-summary';

/**
 * 백업 스냅샷은 두 저장소 어디에나 있을 수 있다 — 활성 대상만 지우면 잔재가 남는다.
 *
 * `Record<BackupTarget, …>`로 못박아 대상이 하나 늘면 **컴파일이 막는다**. 배열이었다면
 * 새 저장소가 조용히 안 지워졌을 것이고, 파괴적 동작에서 그것이 가장 나쁜 실패다.
 */
const CLEARED_TARGETS: Record<BackupTarget, ResetStep> = {
  local: 'clear-local-backups',
  sync: 'clear-sync-backups',
};

export interface ResetEffects {
  /**
   * 자동 백업을 멈춘다. **삭제보다 먼저** 불려야 한다 — 런타임은 상태 변경마다 백업을
   * 예약하므로, 이 중단이 없으면 디바운스 중인 스냅샷이 방금 비운 저장소에 옛 데이터를
   * 다시 써 넣는다.
   */
  suspendAutoBackup(): void | Promise<void>;
  /**
   * 다시 켠다. `snapshot`이 참일 때만 **곧바로 새 스냅샷을 예약**한다 — 초기화가 끝까지
   * 갔을 때의 깨끗한 default 스냅샷이 그것이고, 그것만이 의도된 동작이다. 실패 경로의
   * 상태는 아직 옛 프로필이라, 거기서 예약하면 방금 지운 백업이 옛 데이터로 되살아난다.
   */
  resumeAutoBackup(options: { snapshot: boolean }): void | Promise<void>;
  readBackupKV(target: BackupTarget): Promise<SyncKV>;
  removeBackupKeys(target: BackupTarget, keys: string[]): Promise<void>;
  /** 권위 상태를 기본값으로 되돌린다 (단일 writer 경로를 그대로 탄다). */
  resetState(): Promise<void>;
  clearSummary(): Promise<void>;
}

export type ResetResult = { ok: true } | { ok: false; step: ResetStep; reason: string };

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 한 저장소의 백업 네임스페이스를 비운다. 이미 비어 있으면 지울 키가 0개라 remove를
 * 부르지도 않는다 — 멱등의 실체다. 지웠다고 믿지 않고 **다시 읽어** 검증한다.
 */
async function clearBackups(
  effects: ResetEffects,
  target: BackupTarget,
  step: ResetStep,
): Promise<ResetResult | null> {
  try {
    const keys = backupKeys(await effects.readBackupKV(target));
    if (keys.length > 0) await effects.removeBackupKeys(target, keys);
    const verified = verifyBackupsCleared(await effects.readBackupKV(target));
    if (verified.ok) return null;
    return { ok: false, step, reason: `${verified.remaining.length} backup keys remain` };
  } catch (error) {
    return { ok: false, step, reason: reason(error) };
  }
}

/**
 * 지우는 대상: 로컬 스냅샷 · sync 스냅샷 · 권위 상태(프로필·선호값) · 세션 요약.
 * 브라우저에 설치된 dNR 규칙은 상태가 default로 바뀌면 재컴파일로 비워진다.
 *
 * 순서는 계약이다: **자동 백업 중단 → 저장소 비우기 → 상태 리셋 → 자동 백업 재개**.
 * 첫 실패에서 멈추되 이미 끝난 삭제는 되돌리지 않는다 — 다시 누르면 남은 단계만 남는다.
 */
export async function performFullReset(effects: ResetEffects): Promise<ResetResult> {
  await effects.suspendAutoBackup();
  let completed = false;
  try {
    for (const [target, step] of Object.entries(CLEARED_TARGETS) as [BackupTarget, ResetStep][]) {
      const failure = await clearBackups(effects, target, step);
      if (failure) return failure;
    }
    try {
      await effects.resetState();
    } catch (error) {
      return { ok: false, step: 'reset-state', reason: reason(error) };
    }
    try {
      await effects.clearSummary();
    } catch (error) {
      return { ok: false, step: 'clear-summary', reason: reason(error) };
    }
    completed = true;
    return { ok: true };
  } finally {
    // 실패해도 재개한다. 중단된 채로 남기면 초기화 실패가 "백업이 조용히 멈춘 확장"이
    // 되어, 사용자가 알 수 없는 두 번째 고장을 얹는다. 다만 **새 스냅샷 예약은 끝까지
    // 갔을 때만** — 실패 경로의 상태는 아직 옛 프로필이라, 거기서 예약하면 방금 지운
    // 백업이 옛 데이터로 되살아난다(다음 상태 변경이 정상적으로 다시 예약한다).
    await effects.resumeAutoBackup({ snapshot: completed });
  }
}
