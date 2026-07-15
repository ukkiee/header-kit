import { cva } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { accentBg } from './tokens';

/**
 * 토글 칩 — 선택 상태를 accent로 표시하는 작은 버튼.
 * HeaderRow(override/append/emptyMeans)와 FilterRow(resource-type/method)의
 * 바이트 동일 헬퍼 두 개를 대체한다. aria-pressed로 토글 시맨틱을 제공한다.
 */
const chip = cva('cursor-pointer rounded-full px-1.5 py-0.5 text-[10px] transition-colors', {
  variants: {
    active: {
      true: `${accentBg} text-white`,
      false: 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400',
    },
  },
});

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active: boolean;
}

export function Chip({ active, className, ...props }: ChipProps) {
  return (
    <button type="button" aria-pressed={active} className={chip({ active, className })} {...props} />
  );
}
