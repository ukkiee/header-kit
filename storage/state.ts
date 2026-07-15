import type { Command } from '@/core/commands';
import { parseStoredState, type StoredState } from '@/core/schema';

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

const APPLY_ERROR_KEY = 'applyError';

/** 어댑터의 규칙 적용 실패를 session 저장소에 남긴다 (SW 재기동에도 유지). */
export async function setApplyError(message: string | null): Promise<void> {
  await browser.storage.session.set({ [APPLY_ERROR_KEY]: message });
}

export async function getApplyError(): Promise<string | null> {
  const result = await browser.storage.session.get(APPLY_ERROR_KEY);
  return (result[APPLY_ERROR_KEY] as string | null | undefined) ?? null;
}

export function onApplyErrorChanged(listener: () => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && APPLY_ERROR_KEY in changes) listener();
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
