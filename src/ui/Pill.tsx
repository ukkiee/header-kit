import { cva, type VariantProps } from 'class-variance-authority';
import type { ElementType, HTMLAttributes } from 'react';

/** 작은 배지/태그 — danger(corrupt 스냅샷), neutral(제거가능 항목). */
const pill = cva('rounded px-1.5 py-0.5 text-[10px]', {
  variants: {
    tone: {
      danger: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
      neutral: 'flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface PillProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof pill> {
  as?: ElementType;
}

export function Pill({ as: Tag = 'span', tone, className, ...props }: PillProps) {
  return <Tag className={pill({ tone, className })} {...props} />;
}
