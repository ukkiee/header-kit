import { cva, type VariantProps } from 'class-variance-authority';
import type { ElementType, HTMLAttributes } from 'react';

/** 보조 힌트 텍스트 — 행 하단 주석(row=pl-6), 인라인(ml-1), 독립(none). */
const note = cva('text-[10px] text-zinc-400', {
  variants: { indent: { none: '', row: 'pl-6', inline: 'ml-1' } },
  defaultVariants: { indent: 'none' },
});

export interface NoteTextProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof note> {
  as?: ElementType;
}

export function NoteText({ as: Tag = 'p', indent, className, ...props }: NoteTextProps) {
  return <Tag className={note({ indent, className })} {...props} />;
}
