import { cva, type VariantProps } from 'class-variance-authority';
import { m } from 'motion/react';
import { usePressMotion, type MotionButtonAttributes } from './press-motion';
import { focusRing } from './tokens';

/**
 * 스위처 항목 — 단일 선택 내비게이션 버튼(양 표면 사이드바, ADR 0005).
 * 토글 상태를 표현하는 Chip과 달리 "지금 보고 있는 것"의 선택을 표현한다.
 */
const switcherChip = cva(
  `flex w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs whitespace-nowrap transition-colors ${focusRing}`,
  {
    variants: {
      selected: {
        true: 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100',
        false: 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900',
      },
    },
    defaultVariants: { selected: false },
  },
);

export interface SwitcherChipProps extends MotionButtonAttributes, VariantProps<typeof switcherChip> {}

export function SwitcherChip({ selected, className, type = 'button', ...props }: SwitcherChipProps) {
  const press = usePressMotion();
  return (
    <m.button
      type={type}
      aria-current={selected ? 'true' : undefined}
      className={switcherChip({ selected, className })}
      {...press}
      {...props}
    />
  );
}
