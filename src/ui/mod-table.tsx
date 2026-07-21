import type { ReactNode } from 'react';
import { Button } from './button';
import { microCaption } from './tokens';

/**
 * 수정 테이블 (ADR 0004) — 카드 대신 테이블. 헤더 행과 데이터 행이 같은 컬럼
 * 템플릿을 공유해 세로 정렬이 유지된다: [체크박스][종류][이름][값][확장 토글].
 */
export const modGrid =
  'grid grid-cols-[1.25rem_4.25rem_8rem_minmax(0,1fr)_1.75rem] items-center gap-x-2';

/** 1줄 요약 텍스트(이름+값 두 칸 스팬) — CSP/Redirect 같은 비정형 행이 공유한다. */
export const modSummary =
  'col-span-2 min-w-0 truncate font-mono text-xs text-zinc-600 dark:text-zinc-300';

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

/** 행 확장 프롭 — 단일 확장 상태는 앱 레이어가 든다 (ADR 0004). */
export interface RowExpansionProps {
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

export interface ModRowShellProps extends RowExpansionProps {
  /** 접힌 1줄의 셀들 — modGrid 컬럼 순서대로 (확장 토글 칸은 셸이 채운다). */
  cells: ReactNode;
  /** 확장 영역 내용 — expanded일 때만 렌더된다. */
  children?: ReactNode;
}

/**
 * 수정 행 셸 — 접힌 그리드 행 + 확장 토글(셰브런·여백 클릭) + 확장 영역.
 * HeaderRow/CspRow/RedirectRow가 같은 상호작용 문법을 공유한다.
 */
export function ModRowShell({ expanded = false, onToggleExpanded, cells, children }: ModRowShellProps) {
  return (
    <div className="py-0.5">
      {/* 그리드 여백 클릭도 확장 토글 — "행 선택" 의미론. 입력/버튼 클릭은 제외. */}
      <div
        className={modGrid}
        onClick={
          onToggleExpanded
            ? (e) => {
                if (e.target === e.currentTarget) onToggleExpanded();
              }
            : undefined
        }
      >
        {cells}
        {onToggleExpanded ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Toggle modification options"
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          >
            {expanded ? '▾' : '▸'}
          </Button>
        ) : (
          <span />
        )}
      </div>
      {expanded && children !== undefined && (
        <div className="flex flex-col gap-1.5 pt-1 pb-1.5 pl-7">{children}</div>
      )}
    </div>
  );
}
