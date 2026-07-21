import type { ElementType, HTMLAttributes } from 'react';

/**
 * 컨테이너 표면 — outlined 프로필 카드 하나만 남는다. filled는 상태 요약 슬림화로,
 * row는 테이블형 행 전환(ModRowShell)으로 퇴역했다 (ADR 0004: 보더 대신 명도·여백).
 */
const card = 'flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  as?: ElementType;
}

export function Card({ as: Tag = 'div', className, ...props }: CardProps) {
  return <Tag className={`${card} ${className ?? ''}`} {...props} />;
}
