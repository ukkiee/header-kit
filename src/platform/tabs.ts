import type { TabInfo } from '@/core/compile';

export async function queryTabInfos(): Promise<TabInfo[]> {
  const tabs = await browser.tabs.query({});
  return tabs
    .filter((tab) => tab.id !== undefined)
    .map((tab) => ({
      tabId: tab.id!,
      url: tab.url,
    }));
}

/** 탭 상태가 바뀌는 모든 이벤트 — 재컴파일 트리거로 쓴다. */
export function onTabsChanged(listener: () => void): void {
  browser.tabs.onCreated.addListener(listener);
  browser.tabs.onRemoved.addListener(listener);
  browser.tabs.onUpdated.addListener(listener);
  browser.tabs.onAttached.addListener(listener);
  browser.tabs.onDetached.addListener(listener);
  browser.tabs.onReplaced.addListener(listener);
}
