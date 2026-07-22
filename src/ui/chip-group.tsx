import { Toggle } from '@base-ui-components/react/toggle';
import { ToggleGroup } from '@base-ui-components/react/toggle-group';

/**
 * 토글 칩 그룹 — Base UI Toggle/ToggleGroup 기반 (ADR 0011). 선택 상태는 accent,
 * aria-pressed·roving focus는 Base UI가 제공한다. 캡션은 이 컴포넌트 밖의 span이고
 * 그룹은 aria-label로 이름을 갖는다 — 라벨 요소가 컨트롤을 감싸지 않으므로
 * 라벨 호버가 첫 칩에 전파되던 버그 구조가 없다.
 */
const chipClass =
  'cursor-pointer whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] transition-colors bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 data-[pressed]:bg-blue-600 data-[pressed]:text-white data-[pressed]:hover:bg-blue-600 dark:data-[pressed]:hover:bg-blue-600';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export interface ChipGroupProps<T extends string> {
  /** 선택된 값들 — ToggleGroup의 value로 그대로 흐른다. */
  values: readonly T[];
  options: readonly ChipOption<T>[];
  onValuesChange: (values: T[]) => void;
  'aria-label'?: string;
}

export function ChipGroup<T extends string>({
  values,
  options,
  onValuesChange,
  'aria-label': ariaLabel,
}: ChipGroupProps<T>) {
  return (
    <ToggleGroup
      multiple
      value={values}
      onValueChange={(next) => onValuesChange(next as T[])}
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1"
    >
      {options.map((option) => (
        <Toggle key={option.value} value={option.value} className={chipClass}>
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
