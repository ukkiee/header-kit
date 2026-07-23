import { cva, type VariantProps } from 'class-variance-authority';
import { m } from 'motion/react';
import type { Ref } from 'react';
import { usePressMotion, type MotionButtonAttributes } from './press-motion';
import { focusRing } from './tokens';
import { accentBg, ghostInteractive } from './tokens';

// 누름·호버는 motion이 소유한다 (ADR 0012) — active:scale-95는 여기서 사라진다.
// 색 전이는 CSS가 계속 맡는다(transition-colors).
const button = cva(
  `inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap font-medium transition-[color,background-color,border-color,opacity] disabled:pointer-events-none disabled:opacity-50 ${focusRing}`,
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

export interface ButtonProps extends MotionButtonAttributes, VariantProps<typeof button> {
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ className, variant, size, type = 'button', ref, ...props }: ButtonProps) {
  const press = usePressMotion(props.disabled);
  return (
    <m.button
      ref={ref}
      type={type}
      className={button({ variant, size, className })}
      {...press}
      {...props}
    />
  );
}
