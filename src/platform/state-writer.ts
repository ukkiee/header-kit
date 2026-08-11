import { backupPayload, backupTarget } from '@/core/backup';
import { applyCommand, type Command } from '@/core/commands';
import { performFullReset, type ResetResult } from '@/core/reset';
import type { StoredState } from '@/core/schema';
import type {
  AutoBackupPolicy,
  BackupMutation,
  BackupMutationResult,
  SnapshotOutcome,
  StateWriter,
} from '@/core/state-writer';
import { createWriterLane, type WritePermit } from '@/core/writer-lane';
import {
  clearCloudBackups,
  deleteBackupSnapshot,
  performBackup,
  readBackupKV,
  removeBackupKeys,
} from './backupStore';
import { clearSummary, commitMigration, loadState, persistState, readState } from './stateStore';

/**
 * 영속 저장소를 고치는 **유일한 문** — Writer Lane을 소유하고, 쓰기 허가가 이 파일 밖으로
 * 나가는 시그니처가 하나도 없다.
 *
 * ## 왜 어댑터를 직수입하는가 (이 파일의 존재 이유)
 *
 * 앞선 두 형태가 같은 이유로 뚫렸다.
 *
 * 1. **콜러에게 허가를 넘기던 형태** — 진입점들이 `lane.run(held => …)`으로 허가를 받았고,
 *    한 획득 안에서 `Promise.all`로 띄운 두 read-modify-write가 서로 겹쳐 릴리스 r3의 R-2가
 *    되살아났다(실증됨).
 * 2. **허가를 서비스에 가두었다고 믿었던 형태** — 서비스가 `persistState`를 **주입받았으므로**
 *    허가는 여전히 내보낸 dep 인터페이스의 파라미터였다. 컴포지션 루트가 그 슬롯에 넣는 래퍼는
 *    작업 도중 살아 있는 허가를 쥐고, 거기서 fan-out하면 같은 손실이 났다(실증됨 — 명령은
 *    성공을 보고하고 저장소에는 옛 값이 남는다).
 *
 * 두 번째가 가르쳐 준 것: **레인 작업 안에서 불리는 주입된 dep은 그 자체로 fan-out 자리다.**
 * 능력은 허가라는 물건이 아니라 "작업 안에서 불린다"는 사실이다. 주입을 쓰는 한 없앨 수 없다.
 * 그래서 이 파일은 저장소 어댑터를 주입받지 않고 **직수입한다.** 그 대가로 이 모듈은 저장소
 * fake 없이는 테스트할 수 없지만, 얻는 것은 "한 획득 안에서 병행 쓰기를 띄우지 않는다"를
 * 지켜야 하는 자리가 **정말로 이 파일 하나**라는 사실이다 — 그리고 아래 코드는 전부 직선이다.
 *
 * 주입받는 것은 `validateCommand` 하나뿐이다. 그것은 쓰기 전에 불리고 문자열을 돌려줄 뿐이며,
 * 허가도 dep 슬롯도 갖지 않으므로 저장소를 고칠 방법이 없다.
 *
 * 층: `platform → core`만 쓴다(새 엔지 없음). 계약(`StateWriter`)은 `core/state-writer.ts`에
 * 있어 컴포지션 루트가 구현을 모르고 주입받을 수 있다.
 */

export class CommandRejectedError extends Error {}

export interface StateWriterDeps {
  /**
   * 명령의 저장 시점 검증 (예: regex 플랫폼 지원 여부). 오류 문자열을 반환하면 상태 변경 없이
   * 그 명령만 거부된다 — 부분 수용은 없다. 브라우저 API를 만지므로 이것만 주입받는다.
   */
  validateCommand(command: Command): Promise<string | null>;
}

export function createStateWriter(deps: StateWriterDeps): StateWriter {
  // 이 문 하나가 레인 하나를 소유한다. 소스에서 `createWriterLane(`을 부르는 자리가
  // 하나뿐인지는 `scripts/writer-lane-gate.mjs`가 센다.
  const lane = createWriterLane();

  /**
   * 완료된 전체 초기화의 횟수 (티켓 02 코드리뷰).
   *
   * 스냅샷은 **요청 시점의** 이 값을 집고, 자기 작업이 돌 때 값이 달라져 있으면 쓰지 않는다.
   * 막는 것은 "초기화보다 먼저 요청됐는데 초기화 뒤에 착지하는 스냅샷"이다 — 초기화가
   * reset-state에서 실패하면 상태가 아직 옛 Profile이라, 그 스냅샷이 방금 지운 백업을
   * 되살린다. 레인은 이것을 막지 못한다: 순서대로 돌아도 그 스냅샷이 **뒤**일 수 있다.
   *
   * 부트스트랩의 예약 세대와 겹치지 않는다. 그쪽은 **아직 발화하지 않은 타이머**를 무효화하고,
   * 이쪽은 **이미 요청된 작업**이 착지하는 것을 막는다 — 서로 다른 순간이다.
   */
  let completedResets = 0;

  /**
   * 명령 하나의 read-modify-write. **직렬화하지 않는다** — 레인 작업 안에서만 불리므로
   * 이 함수가 도는 동안 다른 저장소 쓰기가 진행 중일 수 없다. 자체 FIFO를 두지 않는 이유는
   * 같은 성질을 보장하는 기계를 둘 두면 다음 리뷰어가 "둘 중 어느 것이 권위인가"를 다시
   * 묻기 때문이다 (ADR 0016, D4).
   */
  const applyOne = async (permit: WritePermit, command: Command): Promise<StoredState> => {
    const error = await deps.validateCommand(command);
    if (error !== null) throw new CommandRejectedError(error);

    const state = await loadState();
    const next = applyCommand(state, command);
    await persistState(permit, next);
    return next;
  };

  return {
    execute(command: Command): Promise<StoredState> {
      return lane.run((permit) => applyOne(permit, command));
    },

    commitMigration(): Promise<boolean> {
      return lane.run((permit) => commitMigration(permit));
    },

    fullReset(policy: AutoBackupPolicy): Promise<{ result: ResetResult; state?: StoredState }> {
      return lane.run(async (permit) => {
        const applied: { state?: StoredState } = {};
        const result = await performFullReset({
          // 저장소를 만지는 효과는 **여기서 직수입한 것**만 쓴다. 호출부가 건네주게 두면 그
          // 콜백이 레인 작업 안에서 백업 read-modify-write를 fan-out할 수 있다 (r2 R-2).
          readBackupKV,
          removeBackupKeys: (target, keys) => removeBackupKeys(permit, target, keys),
          clearSummary,
          // 예약 정책 둘만 호출부의 것이다 (D8).
          ...policy,
          // 안에서 상태 쓰기를 다시 하지만 레인을 **다시 잡지 않는다** — 받은 허가를 그대로
          // 쓴다. 여기서 잡으면 자기 자신을 기다려 교착한다 (ADR 0016).
          resetState: async () => {
            applied.state = await applyOne(permit, { type: 'full-reset' });
          },
        });
        completedResets += 1;
        return { result, state: applied.state };
      });
    },

    snapshot(): Promise<SnapshotOutcome> {
      const requestedAt = completedResets;
      return lane.run(async (permit) => {
        // 초기화가 이 요청과 착지 사이에 끝났다면 쓰지 않는다 — 위 `completedResets` 참조.
        if (requestedAt !== completedResets) {
          return { status: 'skipped', reason: 'a full reset completed after this snapshot was requested' };
        }
        // 읽을 수 없는 상태는 백업하지 않는다 — 근거는 `core/state-writer`의 `snapshot()`
        // 주석이 정본이다. `loadState`가 아니라 `readState`를 쓰는 이유가 그것이다.
        const read = await readState();
        if (read.status === 'blocked') {
          return {
            status: 'skipped',
            reason: `stored state is unreadable (${read.reason}, v${read.storedVersion}); keeping existing backups intact`,
          };
        }
        const state = read.state;
        const kind = await performBackup(
          permit,
          backupPayload(state),
          state.profiles.length,
          backupTarget(state),
        );
        if (kind === 'write') return { status: 'written' };
        if (kind === 'skip') return { status: 'unchanged' };
        // 예산을 넘겨 아무것도 쓰지 못했다 — 직전 정상본 보존이 우선이지만, 백업이 멈춘
        // 사실은 드러나야 한다.
        return { status: 'skipped', reason: 'snapshot exceeds the backup budget for this store' };
      });
    },

    mutateBackup(mutation: BackupMutation): Promise<BackupMutationResult> {
      return lane.run((permit) => {
        // 문을 하나로 두는 근거는 `core/state-writer`의 `mutateBackup` 주석이 정본이다.
        switch (mutation.op) {
          case 'delete-snapshot':
            return deleteBackupSnapshot(permit, mutation.snapshotId, mutation.target);
          case 'clear-cloud':
            return clearCloudBackups(permit);
          default:
            // 가지를 빠뜨리면 여기서 **어느 op이 남았는지 이름과 함께** 컴파일 오류가 난다.
            // 반환형만으로도 막히지만, 그 진단은 빠진 가지를 짚어 주지 않는다.
            return mutation satisfies never;
        }
      });
    },
  };
}
