import { Checkbox as BaseCheckbox } from '@base-ui-components/react/checkbox';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check } from 'lucide-react';
import { accentBg, fieldFocus, fieldSolid } from './tokens';

/**
 * 체크박스 — Base UI Checkbox 기반 (ADR 0011). role=checkbox·aria-checked·키보드는
 * Base UI가 제공하고, accent는 Button/Chip/Switch와 같은 토큰을 공유한다.
 * offset=row는 상단정렬 행에서 baseline 보정.
 */
const box = cva(
  `flex size-4 shrink-0 cursor-pointer items-center justify-center rounded ${fieldSolid} ${fieldFocus} data-[checked]:border-blue-600`,
  {
    variants: { offset: { none: '', row: 'mt-1.5' } },
    defaultVariants: { offset: 'none' },
  },
);

export interface CheckboxProps extends VariantProps<typeof box> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  offset,
  className,
  checked,
  onCheckedChange,
  disabled,
  'aria-label': ariaLabel,
}: CheckboxProps) {
  return (
    <BaseCheckbox.Root
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={box({ offset, className })}
    >
      <BaseCheckbox.Indicator className={`flex ${accentBg} size-full items-center justify-center rounded-[3px] text-white`}>
        <Check size={12} strokeWidth={2.5} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
