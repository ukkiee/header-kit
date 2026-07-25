import type { Command } from '@/core/commands';
import {
  isBlockedFromOverwrite,
  parseStoredState,
  readStoredState,
  type StoredState,
  type StoredStateRead,
} from '@/core/schema';
import type { StatusSummary } from '@/core/summary';

const STATE_KEY = 'state';
const COMMAND_MESSAGE = 'headerkit:command';

export async function loadState(): Promise<StoredState> {
  const result = await browser.storage.local.get(STATE_KEY);
  return parseStoredState(result[STATE_KEY]);
}

/**
 * 저장된 값을 분류해서 읽는다 — "읽을 수 없음"을 기본 상태로 접지 않는 경로.
 * 파생 데이터를 쓰는 쪽(백업)이 원본의 가독 여부를 알아야 하므로 필요하다.
 */
export async function readState(): Promise<StoredStateRead> {
  const result = await browser.storage.local.get(STATE_KEY);
  return readStoredState(result[STATE_KEY]);
}

/**
 * background의 명령 실행자만 호출한다 — 다른 쓰기 경로는 없다.
 *
 * **쓰기 전에 저장된 값을 다시 읽어 덮어써도 되는지 확인한다** (티켓 02, ADR 0015).
 * 이 가드가 없으면 데이터 손실 경로가 열린다: 이 버전이 이해 못 하는 상태(더 새 포맷,
 * 또는 마이그레이션이 실패한 구 포맷)를 만나면 로드가 기본 상태로 접히고, 그 기본 상태가
 * 다음 저장에서 원본을 통째로 덮는다. 읽기가 blocked라고 판정한 것 위에는 쓰지 않는다.
 *
 * 매 저장마다 읽기가 한 번 더 들지만, 저장은 사용자 조작에서만 일어나고 storage.local은
 * 로컬이라 이 비용보다 프로필을 잃는 쪽이 훨씬 비싸다.
 */
export async function persistState(state: StoredState): Promise<void> {
  const existing = await browser.storage.local.get(STATE_KEY);
  if (isBlockedFromOverwrite(existing[STATE_KEY])) {
    throw new Error(
      'Refusing to overwrite stored state this version cannot read (newer or unmigratable format). Your data is left intact.',
    );
  }
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
