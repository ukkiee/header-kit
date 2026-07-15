import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

/** 수정/필터 종류 라벨 — 고정폭 대문자 캡션(CSP, Cookie, Redirect, 필터 KIND). */
const kindLabel = cva(
  'w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-400',
  {
    variants: { offset: { none: '', filter: 'mt-1' } },
    defaultVariants: { offset: 'none' },
  },
);

export interface KindLabelProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof kindLabel> {}

export function KindLabel({ offset, className, ...props }: KindLabelProps) {
  return <span className={kindLabel({ offset, className })} {...props} />;
}
