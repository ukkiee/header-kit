import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

/**
 * 컨테이너 표면 — outlined(프로필 카드) / filled(요약 카드) / row(수정 행 hover 컨테이너).
 * 팝업 min-width CSS가 의존하는 max-w-3xl 셸 마커는 Card로 흡수하지 않는다(App이 소유).
 */
const card = cva('flex flex-col', {
  variants: {
    variant: {
      outlined: 'gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800',
      filled: 'gap-1.5 rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-900',
      row: 'gap-1 rounded-md border border-transparent px-1 py-1 hover:border-zinc-200 dark:hover:border-zinc-800',
    },
  },
  defaultVariants: { variant: 'outlined' },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof card> {}

export function Card({ variant, className, ...props }: CardProps) {
  return <div className={card({ variant, className })} {...props} />;
}
