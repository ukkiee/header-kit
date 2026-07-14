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

/** UI가 단일 writer(background)로 전이 명령을 보낸다. */
export async function sendCommand(command: Command): Promise<StoredState> {
  return (await browser.runtime.sendMessage({
    type: COMMAND_MESSAGE,
    command,
  })) as StoredState;
}

/** background에서 명령 메시지를 구독한다. */
export function onCommand(handler: (command: Command) => Promise<StoredState>): void {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: unknown }).type === COMMAND_MESSAGE
    ) {
      void handler((message as { command: Command }).command).then(sendResponse);
      return true; // 비동기 응답
    }
    return undefined;
  });
}
