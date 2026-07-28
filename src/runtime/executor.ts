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
 * 상태 전이의 단일 권위 실행자. **명령의** read-modify-write를 한 줄로 직렬화해
 * 명령끼리의 lost update를 차단한다 — background에서 하나만 인스턴스화한다.
 *
 * 이 큐가 덮는 것은 명령뿐이다 (release R2-2). 마이그레이션 커밋
 * (`platform/stateStore.commitMigration`)은 이 큐를 지나지 않고 — 지날 수 없다:
 * 리스너 등록보다 뒤에 돌지만 커맨드와 같은 채널이 아니다 — 대신 쓰기 직전에 읽은
 * 값이 아직 v1일 때만 쓰는 CAS(`persistMigrated`)로 물러난다. 큐를 지난다고 믿고
 * 그 가드를 빼면 커밋이 그 사이 착지한 편집본을 덮는다.
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
