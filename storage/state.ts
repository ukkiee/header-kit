import { parseStoredState, type StoredState } from '@/core/schema';

const STATE_KEY = 'state';

export async function loadState(): Promise<StoredState> {
  const result = await browser.storage.local.get(STATE_KEY);
  return parseStoredState(result[STATE_KEY]);
}

export async function saveState(state: StoredState): Promise<void> {
  await browser.storage.local.set({ [STATE_KEY]: state });
}

export function onStateChanged(listener: () => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && STATE_KEY in changes) listener();
  });
}
