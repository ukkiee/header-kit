import { Select as BaseSelect } from '@base-ui-components/react/select';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, ChevronDown } from 'lucide-react';
import {
  fieldFocus,
  fieldSolid,
  ghostInteractive,
  popupAnchored,
  popupItemText,
  popupPositioner,
  selectFixedWidth,
} from './tokens';

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
      /**
       * 폭 정책. 기본은 `auto` — 대부분의 셀렉트는 Field나 그리드가 폭을 정해 주므로
       * 내용에 따라 흔들리지 않는다(실측: 종류 406px, 모드·빈 값 199px로 컨테이너 고정).
       * `fixed`는 **다른 컨트롤과 같은 행에 있어 폭이 변하면 옆을 미는** 자리에만 준다.
       * 기본을 fixed로 두면 컨테이너가 정해 주던 셋까지 좁아져 아무도 요청하지 않은
       * 레이아웃 변경이 된다.
       */
      width: {
        auto: '',
        fixed: selectFixedWidth,
      },
    },
    defaultVariants: { variant: 'bordered', size: 'sm', width: 'auto' },
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
  width,
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
      <BaseSelect.Trigger id={id} aria-label={ariaLabel} className={trigger({ variant, size, width, className })}>
        <BaseSelect.Value className="truncate" />
        <BaseSelect.Icon className="flex shrink-0 text-zinc-400">
          <ChevronDown size={12} strokeWidth={1.75} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className={popupPositioner}>
          <BaseSelect.Popup className={popupAnchored}>
            {options.map((option) => (
              <BaseSelect.Item
                key={option.value}
                value={option.value}
                className={`justify-between gap-2 ${popupItemText}`}
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
