import { Collapsible as BaseCollapsible } from '@base-ui-components/react/collapsible';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from './icon-button';
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
 * show/hide 토글을 내장한 접이식 패널 — Base UI Collapsible 기반 (ADR 0011).
 * aria-expanded·패널 연결 시맨틱은 Base UI가 제공하고, 표면은 PanelSection 셸 그대로다.
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
    <BaseCollapsible.Root open={open} onOpenChange={onOpenChange}>
      <PanelSection
        title={title}
        actions={
          <BaseCollapsible.Trigger
            render={
              <IconButton
                label={toggleAriaLabel}
                tooltip={open ? hideLabel : showLabel}
                icon={ChevronDown}
                className={`transition-transform ${open ? 'rotate-180' : ''}`}
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
