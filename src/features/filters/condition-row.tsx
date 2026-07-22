import type { Filter } from '@/core/schema';
import type { TabPickerOptions } from '@/platform/tabs';
import { useT } from '@/ui/i18n-context';
import { ItemRow } from '@/features/modifications/rule-row';
import { filterView } from './filter-summary';

export interface ConditionRowProps {
  filter: Filter;
  pickerOptions?: TabPickerOptions;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}

/** 적용 조건 요약 행 (ADR 0009) — 규칙 행과 같은 시각 언어(FILTER 배지). */
export function ConditionRow({
  filter,
  pickerOptions,
  onToggleEnabled,
  onEdit,
  onRemove,
}: ConditionRowProps) {
  const t = useT();
  const view = filterView(filter, t, pickerOptions);
  return (
    <ItemRow
      title={view.title}
      badge={view.badge}
      summary={view.summary}
      enabled={filter.enabled}
      toggleAria={t('ariaEnableFilter')}
      onToggleEnabled={onToggleEnabled}
      onEdit={onEdit}
      onRemove={onRemove}
    />
  );
}
