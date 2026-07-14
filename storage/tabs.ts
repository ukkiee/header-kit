import type { TabInfo } from '@/core/compile';

/** 탭 선택기용 표시 정보 — 라벨은 파생 값이며 저장되지 않는다. */
export interface TabPickerOptions {
  tabs: Array<{ tabId: number; label: string }>;
  groups: Array<{ groupId: number; label: string }>;
  windows: Array<{ windowId: number; label: string }>;
}

export async function queryTabInfos(): Promise<TabInfo[]> {
  const tabs = await browser.tabs.query({});
  return tabs
    .filter((tab) => tab.id !== undefined)
    .map((tab) => ({
      tabId: tab.id!,
      windowId: tab.windowId ?? -1,
      groupId: tab.groupId ?? -1,
      url: tab.url,
    }));
}

/**
 * 탭 선택기 옵션. 그룹·창 라벨은 tabs 권한만으로 파생한다 —
 * tabGroups 권한을 추가하지 않기 위해 그룹 제목 대신 소속 탭 수를 쓴다.
 */
export async function queryTabPickerOptions(): Promise<TabPickerOptions> {
  const tabs = await browser.tabs.query({});
  const usable = tabs.filter((tab) => tab.id !== undefined);

  const groupCounts = new Map<number, number>();
  const windowCounts = new Map<number, number>();
  for (const tab of usable) {
    if (tab.groupId !== undefined && tab.groupId !== -1) {
      groupCounts.set(tab.groupId, (groupCounts.get(tab.groupId) ?? 0) + 1);
    }
    windowCounts.set(tab.windowId ?? -1, (windowCounts.get(tab.windowId ?? -1) ?? 0) + 1);
  }

  return {
    tabs: usable.map((tab) => ({
      tabId: tab.id!,
      label: tab.title?.trim() || tab.url || `Tab ${tab.id}`,
    })),
    groups: [...groupCounts.entries()].map(([groupId, count]) => ({
      groupId,
      label: `Group ${groupId} (${count} tabs)`,
    })),
    windows: [...windowCounts.entries()].map(([windowId, count]) => ({
      windowId,
      label: `Window ${windowId} (${count} tabs)`,
    })),
  };
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
