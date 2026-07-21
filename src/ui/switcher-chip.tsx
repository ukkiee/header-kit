import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

/**
 * 스위처 칩 — 단일 선택 내비게이션 버튼. pill(팝업 칩 스위처)과 row(탭 앱
 * 사이드바 항목)가 같은 선택 토운·상호작용을 공유한다.
 * 토글 상태를 표현하는 Chip과 달리 "지금 보고 있는 것"의 선택을 표현한다.
 */
const switcherChip = cva(
  'flex shrink-0 cursor-pointer items-center gap-1.5 text-xs whitespace-nowrap transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
  {
    variants: {
      selected: {
        true: 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100',
        false: 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900',
      },
      shape: {
        pill: 'h-7 rounded-full px-2.5',
        row: 'w-full rounded-md px-2 py-1.5',
      },
    },
    defaultVariants: { selected: false, shape: 'pill' },
  },
);

export interface SwitcherChipProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof switcherChip> {}

export function SwitcherChip({ selected, shape, className, type = 'button', ...props }: SwitcherChipProps) {
  return (
    <button
      type={type}
      aria-current={selected ? 'true' : undefined}
      className={switcherChip({ selected, shape, className })}
      {...props}
    />
  );
}
