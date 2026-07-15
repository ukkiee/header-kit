import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes } from 'react';

/** 체크박스 — accent를 Button/Chip/Switch와 공유. offset=row는 상단정렬 행에서 baseline 보정. */
const box = cva('size-4 accent-blue-600', {
  variants: { offset: { none: '', row: 'mt-1.5' } },
  defaultVariants: { offset: 'none' },
});

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>,
    VariantProps<typeof box> {}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { offset, className, ...props },
  ref,
) {
  return <input ref={ref} type="checkbox" className={box({ offset, className })} {...props} />;
});
