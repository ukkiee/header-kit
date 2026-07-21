import type { ReactNode } from 'react';
import { microCaption } from './tokens';

/**
 * 수정 테이블 (ADR 0004) — 카드 대신 테이블. 헤더 행과 데이터 행이 같은 컬럼
 * 템플릿을 공유해 세로 정렬이 유지된다: [체크박스][종류][이름][값][확장 토글].
 */
export const modGrid =
  'grid grid-cols-[1.25rem_4.25rem_8rem_minmax(0,1fr)_1.75rem] items-center gap-x-2';

export interface ModTableHeaderProps {
  nameLabel: ReactNode;
  valueLabel: ReactNode;
}

/** 컬럼 헤더 행 — 이름/값 라벨만 보이고 나머지 칸은 자리만 차지한다. */
export function ModTableHeader({ nameLabel, valueLabel }: ModTableHeaderProps) {
  return (
    <div
      className={`${modGrid} ${microCaption} border-b border-zinc-100 pb-1 dark:border-zinc-800 dark:text-zinc-500`}
    >
      <span />
      <span />
      <span>{nameLabel}</span>
      <span>{valueLabel}</span>
      <span />
    </div>
  );
}
