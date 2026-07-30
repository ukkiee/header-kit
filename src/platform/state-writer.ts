import { applyCommand, type Command } from '@/core/commands';
import { performFullReset, type ResetResult } from '@/core/reset';
import type { StoredState } from '@/core/schema';
import type { FullResetEffects, StateWriter } from '@/core/state-writer';
import { createWriterLane, type WritePermit } from '@/core/writer-lane';
import { commitMigration, loadState, persistState } from './stateStore';

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

    fullReset(effects: FullResetEffects): Promise<{ result: ResetResult; state?: StoredState }> {
      return lane.run(async (permit) => {
        const applied: { state?: StoredState } = {};
        const result = await performFullReset({
          ...effects,
          // 안에서 상태 쓰기를 다시 하지만 레인을 **다시 잡지 않는다** — 받은 허가를 그대로
          // 쓴다. 여기서 잡으면 자기 자신을 기다려 교착한다 (ADR 0016).
          resetState: async () => {
            applied.state = await applyOne(permit, { type: 'full-reset' });
          },
        });
        return { result, state: applied.state };
      });
    },
  };
}
