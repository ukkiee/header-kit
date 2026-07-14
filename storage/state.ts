import { parseStoredState, type StoredState } from '@/core/schema';

const STATE_KEY = 'state';

export async function loadState(): Promise<StoredState> {
  const result = await browser.storage.local.get(STATE_KEY);
  return parseStoredState(result[STATE_KEY]);
}

/**
 * 상태 전이의 유일한 쓰기 경로. UI·Import·Restore는 core/commands의
 * 명령을 이 함수에 넘길 뿐, StoredState를 직접 조립·기록하지 않는다.
 */
export async function mutateState(
  transition: (state: StoredState) => StoredState,
): Promise<StoredState> {
  const current = await loadState();
  const next = transition(current);
  await browser.storage.local.set({ [STATE_KEY]: next });
  return next;
}

export function onStateChanged(listener: () => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && STATE_KEY in changes) listener();
  });
}
