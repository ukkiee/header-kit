import type { MessageKey, Translator } from '@/core/i18n';
import { UNSET_ID, type Filter, type FilterKind } from '@/core/schema';
import type { TabPickerOptions } from '@/platform/tabs';

/**
 * 적용 조건의 읽기 요약 (ADR 0009) — 규칙 요약(ruleView)과 같은 시각 언어.
 * 배지는 FILTER 단일, 제목은 종류 라벨, 요약은 조건 값 한 줄.
 */
export interface FilterRuleView {
  title: string;
  badge: 'FILTER';
  summary: string;
}

export const FILTER_KIND_LABELS: Record<FilterKind, MessageKey> = {
  url: 'filterUrl',
  'exclude-url': 'filterExcludeUrl',
  'resource-type': 'filterResourceType',
  'request-method': 'filterRequestMethod',
  'initiator-domain': 'filterInitiatorDomain',
  tab: 'filterTab',
  'tab-group': 'filterTabGroup',
  window: 'filterWindow',
  'tab-domain': 'filterTabDomain',
  time: 'filterTime',
};

export function filterView(
  filter: Filter,
  t: Translator,
  pickerOptions?: TabPickerOptions,
): FilterRuleView {
  const title = t(FILTER_KIND_LABELS[filter.kind]);
  const summary = summarize(filter, t, pickerOptions) || t('emptyMarker');
  return { title, badge: 'FILTER', summary };
}

function summarize(filter: Filter, t: Translator, picker?: TabPickerOptions): string {
  switch (filter.kind) {
    case 'url':
    case 'exclude-url':
      return filter.pattern.trim();
    case 'resource-type':
      return filter.resourceTypes.join(' · ');
    case 'request-method':
      return filter.methods.join(' · ');
    case 'initiator-domain':
    case 'tab-domain':
      return filter.domain.trim();
    case 'tab': {
      if (filter.tabId === UNSET_ID) return '';
      const label = picker?.tabs.find((x) => x.tabId === filter.tabId)?.label;
      return label ?? t('filterClosed');
    }
    case 'tab-group': {
      if (filter.groupId === UNSET_ID) return '';
      const label = picker?.groups.find((x) => x.groupId === filter.groupId)?.label;
      return label ?? t('filterClosed');
    }
    case 'window': {
      if (filter.windowId === UNSET_ID) return '';
      const label = picker?.windows.find((x) => x.windowId === filter.windowId)?.label;
      return label ?? t('filterClosed');
    }
    case 'time':
      return `${new Date(filter.expiresAt).toLocaleString()} ${t('filterShortTime')}`;
  }
}
