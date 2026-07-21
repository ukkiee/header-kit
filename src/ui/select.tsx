import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { fieldFocus, fieldSolid, ghostInteractive } from './tokens';

/**
 * Select recipe — bordered는 Input.solid 표면+포커스를, ghost는 Button.ghost 표면을
 * tokens.ts에서 공유해 재사용한다. outline-none은 bordered에만 두어(focus:border로 대체)
 * ghost는 기본 포커스 outline을 유지한다(키보드 a11y). children은 <option>들.
 */
const select = cva('cursor-pointer whitespace-nowrap rounded-md', {
  variants: {
    variant: {
      bordered: `${fieldSolid} px-1 ${fieldFocus}`,
      ghost: `bg-transparent px-1 ${ghostInteractive}`,
    },
    size: {
      sm: 'h-7 text-xs',
      md: 'h-8 text-xs',
    },
  },
  defaultVariants: { variant: 'bordered', size: 'sm' },
});

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof select> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { variant, size, className, ...props },
  ref,
) {
  return <select ref={ref} className={select({ variant, size, className })} {...props} />;
});
