import type { Command } from '@/core/commands';
import {
  isBlockedFromOverwrite,
  readStoredState,
  type StoredState,
  type StoredStateRead,
} from '@/core/schema';
import type { StatusSummary } from '@/core/summary';

const STATE_KEY = 'state';
const COMMAND_MESSAGE = 'headerkit:command';

/** 읽을 수 없는 저장 상태로 로드가 멈췄다는 **타입화된** 오류 (R-3) — 기본 상태로 접으면
 *  화면은 "프로필이 사라진" 모습을 오류 없이 그리고 재조정은 빈 규칙을 적용한다. */
export class StateLoadError extends Error {
  constructor(readonly reason: 'newer' | 'unmigratable', readonly storedVersion: number) {
    super(`Stored state is unreadable (${reason}, v${storedVersion}). Your data is left intact.`);
    this.name = 'StateLoadError';
  }
}

/** 권위 저장소에서 **읽기만 한다** — 마이그레이션 커밋은 `commitMigration`이 따로 한다.
 *  읽을 수 없는 값은 접지 않고 던진다(원본은 그대로 남는다).
 *
 *  왜 읽기 경로가 쓰지 않는가 (티켓 14): 이 함수는 재조정의 loadSnapshot이 쓰는 읽기다.
 *  여기서 storage.local에 쓰면 그 쓰기가 `onStateChanged`를 때려 새 세대를 만들고, 쓰기를
 *  수행한 그 세대 자신이 post-loadSnapshot 가드에서 물러나 `apply`를 부르지 못한다 —
 *  규칙 적용이 저장소 왕복 한 번만큼 밀린다. */
export async function loadState(): Promise<StoredState> {
  const read = await readState();
  if (read.status === 'blocked') throw new StateLoadError(read.reason, read.storedVersion);
  return read.state;
}

/**
 * 검증을 통과한 v1→v2를 **권위 저장소에 굳힌다** (R-3) — 메모리 변환만이면 저장소는
 * 영원히 v1이다. 이미 v2면 아무것도 쓰지 않고 `false`.
 *
 * 호출부는 background 컴포지션 루트 하나뿐이고, **재조정 바깥에서 한 번만** 돈다(티켓 14).
 * 실패는 삼키지 않고 호출자에게 전파한다 — 저장소가 v1로 남은 사실이 조용히 묻히지 않게.
 */
export async function commitMigration(): Promise<boolean> {
  const read = await readState();
  if (read.status === 'blocked') throw new StateLoadError(read.reason, read.storedVersion);
  if (read.status !== 'migrated') return false;
  // 덮어쓰기 가드를 다시 지나도록 persistState로 쓴다 — 새 쓰기 경로를 열지 않는다.
  await persistState(read.state);
  return true;
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
 * background의 명령 실행자와 위 마이그레이션 커밋만 호출한다 — 다른 쓰기 경로는 없다.
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

/**
 * 세션 요약을 지운다 (전체 초기화 R-3). 요약은 파생 데이터라 다음 재조정이 새로 발행하지만,
 * 지우지 않으면 초기화 직후 한 프레임 동안 없어진 프로필의 규칙 수가 화면에 남는다.
 */
export async function clearSummary(): Promise<void> {
  await browser.storage.session.remove(SUMMARY_KEY);
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
