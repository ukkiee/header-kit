import type { Command } from '@/core/commands';
import { parseStoredState, type StoredState } from '@/core/schema';
import type { StatusSummary } from '@/core/summary';

const STATE_KEY = 'state';
const COMMAND_MESSAGE = 'headerkit:command';

export async function loadState(): Promise<StoredState> {
  const result = await browser.storage.local.get(STATE_KEY);
  return parseStoredState(result[STATE_KEY]);
}

/** background의 명령 실행자만 호출한다 — 다른 쓰기 경로는 없다. */
export async function persistState(state: StoredState): Promise<void> {
  await browser.storage.local.set({ [STATE_KEY]: state });
}

export function onStateChanged(listener: () => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && STATE_KEY in changes) listener();
  });
}

const SUMMARY_KEY = 'statusSummary';

/**
 * background가 실제로 적용한 그 스냅샷에서 만든 상태 요약을 session에 발행한다.
 * UI는 이 값을 읽기만 한다 — 독립 재컴파일로 적용분과 어긋나지 않게 한다.
 */
export async function publishSummary(summary: StatusSummary): Promise<void> {
  await browser.storage.session.set({ [SUMMARY_KEY]: summary });
}

export async function getSummary(): Promise<StatusSummary | null> {
  const result = await browser.storage.session.get(SUMMARY_KEY);
  return (result[SUMMARY_KEY] as StatusSummary | undefined) ?? null;
}

export function onSummaryChanged(listener: () => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && SUMMARY_KEY in changes) listener();
  });
}

export type CommandResult =
  | { ok: true; state: StoredState }
  | { ok: false; error: string };

/** UI가 단일 writer(background)로 전이 명령을 보낸다. */
export async function sendCommand(command: Command): Promise<CommandResult> {
  return (await browser.runtime.sendMessage({
    type: COMMAND_MESSAGE,
    command,
  })) as CommandResult;
}

/** background에서 명령 메시지를 구독한다. 거부·실패는 오류 응답으로 돌려준다. */
export function onCommand(handler: (command: Command) => Promise<StoredState>): void {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: unknown }).type === COMMAND_MESSAGE
    ) {
      void handler((message as { command: Command }).command)
        .then((state) => sendResponse({ ok: true, state } satisfies CommandResult))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          } satisfies CommandResult),
        );
      return true; // 비동기 응답
    }
    return undefined;
  });
}
