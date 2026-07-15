import type { ReactNode } from 'react';
import { Button } from './button';
import { PanelSection } from './panel-section';

export interface CollapsiblePanelProps {
  title: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showLabel: string;
  hideLabel: string;
  toggleAriaLabel: string;
  /** open과 무관하게 헤더 바로 아래 항상 보이는 슬롯 (예: 에러 배너). */
  banner?: ReactNode;
  children?: ReactNode;
}

/**
 * show/hide 토글을 내장한 접이식 패널 — PanelSection 셸 위에 open 상태 관리를 얹는다.
 * Backup/Preferences의 `useState(open)` + 토글 버튼 + `{open && …}` 삼중 중복을 흡수한다.
 * (Transfer는 mode 기반이라 PanelSection을 직접 쓴다 — 게이팅 모델이 다르다.)
 */
export function CollapsiblePanel({
  title,
  open,
  onOpenChange,
  showLabel,
  hideLabel,
  toggleAriaLabel,
  banner,
  children,
}: CollapsiblePanelProps) {
  return (
    <PanelSection
      title={title}
      actions={
        <Button
          variant="ghost"
          size="sm"
          aria-label={toggleAriaLabel}
          onClick={() => onOpenChange(!open)}
        >
          {open ? hideLabel : showLabel}
        </Button>
      }
    >
      {banner}
      {open && children}
    </PanelSection>
  );
}
