import { Collapsible as BaseCollapsible } from '@base-ui-components/react/collapsible';
import { ChevronDown } from 'lucide-react';
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
        renderHeader={
          <BaseCollapsible.Trigger
            render={
              <button
                type="button"
                aria-label={toggleAriaLabel}
                // w-full은 두지 않는다 — PanelSection의 flex-col이 이미 행 전체로 늘린다.
                className={`cursor-pointer rounded-md px-1 py-0.5 text-left ${ghostInteractive} ${focusRing}`}
              />
            }
          />
        }
      >
        {banner}
        <BaseCollapsible.Panel>{children}</BaseCollapsible.Panel>
      </PanelSection>
    </BaseCollapsible.Root>
  );
}
