import { Select as BaseSelect } from '@base-ui-components/react/select';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, ChevronDown } from 'lucide-react';
import { fieldFocus, fieldSolid, ghostInteractive, popupItem, popupSurface } from './tokens';

/**
 * Select — Base UI Select 기반 (ADR 0011). 팝업이 OS 네이티브가 아니라 앱 표면
 * (Menu와 같은 보더+명도 팝업)으로 렌더된다. options 배열이 아이템의 단일 출처이고,
 * items로도 전달해 Trigger의 Value가 원시 값 대신 라벨을 표시하게 한다.
 * 키보드(화살표·Enter·Esc·타이핑 검색)와 role=combobox/option 시맨틱은 Base UI가 제공한다.
 */
const trigger = cva(
  'flex cursor-pointer items-center justify-between gap-1 whitespace-nowrap rounded-md',
  {
    variants: {
      variant: {
        bordered: `${fieldSolid} px-1.5 ${fieldFocus}`,
        ghost: `bg-transparent px-1.5 ${ghostInteractive}`,
      },
      size: {
        sm: 'h-7 text-xs',
        md: 'h-8 text-xs',
      },
    },
    defaultVariants: { variant: 'bordered', size: 'sm' },
  },
);

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

/** 값 타입 T가 현재 값·옵션·콜백에 일관 적용된다 — 호출부가 도메인 union을 그대로 쓴다. */
export interface SelectProps<T extends string> extends VariantProps<typeof trigger> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  'aria-label'?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function Select<T extends string>({
  variant,
  size,
  className,
  value,
  onValueChange,
  options,
  disabled,
  id,
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  return (
    <BaseSelect.Root
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      disabled={disabled}
    >
      <BaseSelect.Trigger id={id} aria-label={ariaLabel} className={trigger({ variant, size, className })}>
        <BaseSelect.Value className="truncate" />
        <BaseSelect.Icon className="flex shrink-0 text-zinc-400">
          <ChevronDown size={12} strokeWidth={1.75} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="z-50 outline-none">
          <BaseSelect.Popup className={`min-w-[var(--anchor-width)] outline-none ${popupSurface}`}>
            {options.map((option) => (
              <BaseSelect.Item
                key={option.value}
                value={option.value}
                className={`justify-between gap-2 text-zinc-700 dark:text-zinc-200 ${popupItem}`}
              >
                <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                <BaseSelect.ItemIndicator className="flex text-blue-600 dark:text-blue-400">
                  <Check size={12} strokeWidth={1.75} />
                </BaseSelect.ItemIndicator>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
