import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { focusRing } from './tokens';
import { accentBg, ghostInteractive } from './tokens';

const button = cva(
  `inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap font-medium transition active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${focusRing}`,
  {
    variants: {
      // pill(rounded-full)은 주 액션 신호 — DESIGN의 primary CTA 문법.
      variant: {
        primary: `rounded-full ${accentBg} text-white hover:bg-blue-500`,
        ghost: `rounded-md bg-transparent ${ghostInteractive}`,
        danger: 'rounded-md bg-transparent text-red-600 hover:bg-red-50 dark:hover:bg-red-950',
      },
      size: {
        sm: 'h-7 px-2 text-xs',
        md: 'h-9 px-3 text-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={button({ variant, size, className })} {...props} />;
}
