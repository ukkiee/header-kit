import { applyCommand, type Command } from '@/core/commands';
import type { StoredState } from '@/core/schema';
import type { Held } from '@/core/writer-lane';

export interface ExecutorDeps {
  load: () => Promise<StoredState>;
  save: (held: Held, state: StoredState) => Promise<void>;
  /**
   * 명령의 저장 시점 검증 (예: regex 플랫폼 지원 여부). 오류 문자열을
   * 반환하면 상태 변경 없이 그 명령만 거부된다 — 부분 수용은 없다.
   */
  validate?: (command: Command) => Promise<string | null>;
}

export class CommandRejectedError extends Error {}

export interface CommandExecutor {
  /**
   * 명령 하나의 read-modify-write를 수행한다. **직렬화는 하지 않는다** — 레인을 쥔 증표를
   * 요구하므로 이 함수가 도는 동안 다른 저장소 작업이 진행 중일 수 없다.
   */
  execute: (held: Held, command: Command) => Promise<StoredState>;
}

/**
 * 상태 전이의 단일 권위 실행자 — background에서 하나만 인스턴스화한다.
 *
 * 자체 FIFO를 두지 않는다 (ADR 0016, D4). 레인이 요청 경계에서 잡히므로 그 큐는 프로덕션에서
 * 항상 이미 비어 있고, 같은 성질을 보장하는 기계를 둘 두면 다음 리뷰어가 "둘 중 어느 것이
 * 권위인가"를 다시 묻는다. 겹쳐 도착한 전이가 전부 최종 상태에 남는다는 성질은 레인이
 * 보장하며, 그 단언은 레인이 실제로 배선된 자리(S3)에서 확인한다.
 */
export function createCommandExecutor(deps: ExecutorDeps): CommandExecutor {
  return {
    async execute(held: Held, command: Command): Promise<StoredState> {
      const error = deps.validate ? await deps.validate(command) : null;
      if (error !== null) throw new CommandRejectedError(error);

      const state = await deps.load();
      const next = applyCommand(state, command);
      await deps.save(held, next);
      return next;
    },
  };
}
