import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { accentBg, ghostInteractive } from './tokens';

const button = cva(
  'inline-flex cursor-pointer items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: `${accentBg} text-white hover:bg-blue-500`,
        ghost: `bg-transparent ${ghostInteractive}`,
        danger: 'bg-transparent text-red-600 hover:bg-red-50 dark:hover:bg-red-950',
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
