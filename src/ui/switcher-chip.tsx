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
        true: 'font-medium text-foreground',
        false: 'text-muted-foreground',
      },
      /**
       * 면을 **자기가** 칠하는가.
       *
       * 기본은 참이다 — 혼자 서는 칩(＋ 새 프로필)은 자기 배경이 곧 선택 표시다. 거짓은
       * 칩이 더 큰 표면의 일부일 때다: 프로필 행은 칩 옆에 켬/끔 스위치가 함께 서고, 선택
       * 표시가 칩에만 칠해지면 스위치가 그 면 **밖에** 남아 한 행이 두 조각으로 보인다.
       * 그때는 행이 면을 들고 칩은 글자만 바꾼다.
       */
      filled: { true: '', false: '' },
    },
    compoundVariants: [
      { selected: true, filled: true, class: 'bg-secondary' },
      { selected: false, filled: true, class: 'hover:bg-accent' },
    ],
    defaultVariants: { selected: false, filled: true },
  },
);

export interface SwitcherChipProps extends MotionButtonAttributes, VariantProps<typeof switcherChip> {}

export function SwitcherChip({ selected, className, type = 'button', ...props }: SwitcherChipProps) {
  const press = usePressMotion(props.disabled);
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
