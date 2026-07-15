import { applyCommand, type Command } from '@/core/commands';
import type { StoredState } from '@/core/schema';

export interface ExecutorDeps {
  load: () => Promise<StoredState>;
  save: (state: StoredState) => Promise<void>;
  /**
   * 명령의 저장 시점 검증 (예: regex 플랫폼 지원 여부). 오류 문자열을
   * 반환하면 상태 변경 없이 그 명령만 거부된다 — 부분 수용은 없다.
   */
  validate?: (command: Command) => Promise<string | null>;
}

export class CommandRejectedError extends Error {}

export interface CommandExecutor {
  /** 명령을 FIFO로 직렬 실행한다. 겹쳐 도착한 전이도 전부 최종 상태에 남는다. */
  execute: (command: Command) => Promise<StoredState>;
}

/**
 * 상태 전이의 단일 권위 실행자. 저장 상태의 read-modify-write를 한 줄로
 * 직렬화해 lost update를 차단한다 — background에서 하나만 인스턴스화한다.
 */
export function createCommandExecutor(deps: ExecutorDeps): CommandExecutor {
  let tail: Promise<unknown> = Promise.resolve();

  return {
    execute(command: Command): Promise<StoredState> {
      const run = tail.then(async () => {
        const error = deps.validate ? await deps.validate(command) : null;
        if (error !== null) throw new CommandRejectedError(error);

        const state = await deps.load();
        const next = applyCommand(state, command);
        await deps.save(next);
        return next;
      });
      // 실패한 명령이 뒤 명령을 막지 않도록 체인은 결과와 무관하게 이어간다.
      tail = run.catch(() => undefined);
      return run;
    },
  };
}
