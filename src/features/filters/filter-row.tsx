import type { Filter } from '@/core/schema';
import type { TabPickerOptions } from '@/platform/tabs';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import { useT } from '@/ui/i18n-context';
import { KindLabel } from '@/ui/kind-label';
import { FilterEditor, KIND_LABEL_KEYS } from './filter-editor';

export interface FilterRowProps {
  filter: Filter;
  onChange: (next: Filter) => void;
  onRemove: () => void;
  /** 탭 계열 Filter 선택기의 표시 옵션 — 팝업이 tabs API에서 로드해 내려준다. */
  pickerOptions?: TabPickerOptions;
}

/** 필터 한 줄 — 활성 토글 + 종류 라벨 + 종류별 편집기(FilterEditor) + 제거. */
export function FilterRow({ filter, onChange, onRemove, pickerOptions }: FilterRowProps) {
  const t = useT();
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        offset="row"
        checked={filter.enabled}
        onChange={(e) => onChange({ ...filter, enabled: e.target.checked })}
        aria-label="Enable filter"
      />
      <KindLabel offset="filter">{t(KIND_LABEL_KEYS[filter.kind])}</KindLabel>
      <FilterEditor filter={filter} onChange={onChange} pickerOptions={pickerOptions} />
      <Button variant="danger" size="sm" onClick={onRemove} aria-label="Remove filter">
        ✕
      </Button>
    </div>
  );
}
