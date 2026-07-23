import { ChevronDown } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { AnimatePresence, MotionRow } from './motion-row';
import { PanelSection } from './panel-section';
import { focusRing, ghostInteractive } from './tokens';

export interface CollapsiblePanelProps {
  title: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toggleAriaLabel: string;
  /** open과 무관하게 헤더 바로 아래 항상 보이는 슬롯 (예: 에러 배너). */
  banner?: ReactNode;
  children?: ReactNode;
}

/**
 * show/hide 토글을 내장한 접이식 패널. 표면은 PanelSection 셸 그대로다.
 * (Transfer는 mode 기반이라 PanelSection을 직접 쓴다 — 게이팅 모델이 다르다.)
 *
 * **헤더 행 전체가 트리거다.** 제목·여백·아이콘 어디를 눌러도 열린다 — 오른쪽 끝의
 * 작은 아이콘을 조준하지 않아도 된다. 그래서 아이콘은 더 이상 별도 버튼이 아니라
 * 트리거 안의 시각 표시(회전)다. 버튼 안에 버튼을 넣을 수 없기도 하고, 포커스 대상이
 * 둘이 되면 Tab 정지가 늘어난다.
 *
 * 접근성 이름은 `toggleAriaLabel`로 고정한다 — 보이는 제목("환경설정")이 그 이름에
 * 포함되므로(WCAG 2.5.3) 문제없고, 화면에 보이는 것보다 동작을 먼저 알린다.
 *
 * 헤더는 누름·호버 spring을 **쓰지 않는다** (ADR 0012의 명시적 예외). 폭이 좁은 버튼에서
 * 자연스러운 1.02배가 화면 폭을 다 쓰는 헤더 행에서는 이동 거리가 그만큼 커져 과했다.
 * 이 표면의 피드백은 색 전이와 열림/닫힘 전환이 맡는다.
 *
 * **Base UI Collapsible을 쓰지 않는다** (ADR 0011의 예외). 필요한 시맨틱은
 * `aria-expanded` + `aria-controls` 둘뿐이라 직접 적는 편이 짧고, 무엇보다 열림/닫힘
 * 애니메이션이 Base UI의 마운트 타이밍과 경합했다 — **20회 중 6~9회가 전이 없이 즉시
 * 닫혔다.** `height`를 `grid-template-rows`로 바꿔도, `interpolate-size`를 켜도,
 * `keepMounted`를 줘도, CSS 전이를 키프레임 애니메이션으로 바꿔도 비율은 그대로였다.
 * 있다가 없다가 하는 결함이라 한 번 보고 넘기면 못 잡는다.
 *
 * 대신 이 저장소가 이미 쓰고 검증한 `MotionRow`(AnimatePresence + height)를 쓴다 —
 * 규칙 폼이 같은 이유로 native `details`를 버리고 상태+MotionRow로 간 선례가 있다
 * (ui-refine 08). reduced-motion 처리도 거기 한 곳에 이미 있다. smoke N29가 시간으로
 * 못박는다.
 */
export function CollapsiblePanel({
  title,
  open,
  onOpenChange,
  toggleAriaLabel,
  banner,
  children,
}: CollapsiblePanelProps) {
  const panelId = useId();

  return (
    <PanelSection
      title={title}
      actions={
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      }
      renderHeader={({ className, children: headerContent }) => (
        <button
          type="button"
          aria-label={toggleAriaLabel}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onOpenChange(!open)}
          // w-full은 두지 않는다 — PanelSection의 flex-col이 이미 행 전체로 늘린다.
          // min-h-6은 WCAG 2.5.8의 24×24 최소 타깃 — 폭만 넓히고 높이를 줄이면
          // "조준하지 않아도 된다"가 세로로는 나빠진다.
          className={`min-h-6 cursor-pointer rounded-md px-1 text-left transition-colors ${ghostInteractive} ${focusRing} ${className}`}
        >
          {headerContent}
        </button>
      )}
    >
      {banner}
      <AnimatePresence initial={false}>
        {open && (
          <MotionRow>
            <div id={panelId}>{children}</div>
          </MotionRow>
        )}
      </AnimatePresence>
    </PanelSection>
  );
}
