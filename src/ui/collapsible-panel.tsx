import { Collapsible as BaseCollapsible } from '@base-ui-components/react/collapsible';
import { ChevronDown } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
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
 * show/hide 토글을 내장한 접이식 패널 — Base UI Collapsible 기반 (ADR 0011).
 * aria-expanded·패널 연결 시맨틱은 Base UI가 제공하고, 표면은 PanelSection 셸 그대로다.
 * (Transfer는 mode 기반이라 PanelSection을 직접 쓴다 — 게이팅 모델이 다르다.)
 *
 * **헤더 행 전체가 트리거다.** 제목·여백·아이콘 어디를 눌러도 열린다 — 오른쪽 끝의
 * 작은 아이콘을 조준하지 않아도 된다. 그래서 아이콘은 더 이상 별도 버튼이 아니라
 * 트리거 안의 시각 표시(회전)다. 버튼 안에 버튼을 넣을 수 없기도 하고, 포커스 대상이
 * 둘이 되면 Tab 정지가 늘어난다.
 *
 * 접근성 이름은 `toggleAriaLabel`로 고정한다 — 보이는 제목("환경설정")이 그 이름에
 * 포함되므로(WCAG 2.5.3) 문제없고, 화면에 보이는 것보다 동작을 먼저 알린다.
 */
export function CollapsiblePanel({
  title,
  open,
  onOpenChange,
  toggleAriaLabel,
  banner,
  children,
}: CollapsiblePanelProps) {
  /**
   * 헤더는 누름·호버 spring을 **쓰지 않는다** (ADR 0012의 명시적 예외).
   *
   * 한때 다른 버튼 프리미티브와 같은 `usePressMotion`을 썼다. 폭이 좁은 버튼에서
   * 자연스러운 1.02배가 화면 폭을 다 쓰는 헤더 행에서는 이동 거리가 그만큼 커져
   * 과하게 보였다 — 같은 배율이 같은 인상을 주지 않는다. 대신 이 표면의 피드백은
   * 색 전이(`ghostInteractive`)와 **열림/닫힘 높이 전환**이 맡는다. 상태가 실제로
   * 바뀌는 표면이라 그쪽이 더 많은 것을 알려 준다.
   */
  const reduce = useReducedMotion();
  return (
    <BaseCollapsible.Root open={open} onOpenChange={onOpenChange}>
      <PanelSection
        title={title}
        actions={
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        }
        renderHeader={({ className, children }) => (
          <BaseCollapsible.Trigger
            render={
              <button
                type="button"
                aria-label={toggleAriaLabel}
                // w-full은 두지 않는다 — PanelSection의 flex-col이 이미 행 전체로 늘린다.
                // min-h-6은 WCAG 2.5.8의 24×24 최소 타깃 — 폭만 넓히고 높이를 줄이면
                // "조준하지 않아도 된다"가 세로로는 나빠진다.
                className={`min-h-6 cursor-pointer rounded-md px-1 text-left transition-colors ${ghostInteractive} ${focusRing} ${className}`}
              />
            }
          >
            {children}
          </BaseCollapsible.Trigger>
        )}
      >
        {banner}
        {/*
          높이 전환 — Base UI가 패널 실측 높이를 `--collapsible-panel-height`로 주고,
          열리는 첫 프레임과 닫히는 마지막 프레임에 `data-starting-style`/`data-ending-style`을
          붙인다. 그 두 지점만 0으로 잡으면 나머지 구간은 CSS 전이가 잇는다.

          motion이 아니라 CSS인 이유 — 여기서 움직이는 것은 Base UI가 마운트를 소유한
          패널이다. AnimatePresence를 겹치면 두 라이브러리가 같은 노드의 생사를 두고
          다툰다. 대신 **길이는 여전히 motion-tokens 한 곳**에서 온다.

          reduced-motion이면 전이 클래스를 아예 붙이지 않는다 — 지속시간 0으로 대체하는
          것이 아니라 부재다(ADR 0012 경계, press-motion과 같은 규율).

          길이를 CSS 변수로 받는 이유 — Panel에 `style`을 직접 주든 `render`로 주든 Base UI가
          자기 변수(`--collapsible-panel-height`)로 **덮어써서 사라진다**(둘 다 실측).
          변수는 MotionProvider가 문서 루트에 올린다(거기 주석 참고).
        */}
        <BaseCollapsible.Panel
          className={`h-[var(--collapsible-panel-height)] overflow-hidden data-[ending-style]:h-0 data-[starting-style]:h-0 ${
            reduce ? '' : 'transition-[height] duration-[var(--panel-collapse)] ease-out'
          }`}
        >
          {children}
        </BaseCollapsible.Panel>
      </PanelSection>
    </BaseCollapsible.Root>
  );
}
