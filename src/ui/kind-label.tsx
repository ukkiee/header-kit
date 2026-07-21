import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { microCaption } from './tokens';

/** 수정/필터 종류 라벨 — 고정폭 대문자 캡션(CSP, Cookie, Redirect, 필터 KIND). */
const kindLabel = cva(`shrink-0 whitespace-nowrap ${microCaption}`, {
  variants: {
    offset: { none: '', filter: 'mt-1' },
    /** fixed = 독립 배치용 고정폭, auto = 그리드 셀 등 폭을 부모가 정하는 곳. */
    width: { fixed: 'w-14', auto: '' },
  },
  defaultVariants: { offset: 'none', width: 'fixed' },
});

export interface KindLabelProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof kindLabel> {}

export function KindLabel({ offset, width, className, ...props }: KindLabelProps) {
  return <span className={kindLabel({ offset, width, className })} {...props} />;
}
