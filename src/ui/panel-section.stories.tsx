import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronDown } from 'lucide-react';
import { Button } from './button';
import { PanelSection } from './panel-section';

const meta = {
  title: 'UI/PanelSection',
  component: PanelSection,
} satisfies Meta<typeof PanelSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 기본 셸 — 헤더는 `<header>`이고 우측 슬롯에 액션 버튼이 온다(Transfer가 이 형태). */
export const WithActions: Story = {
  args: {
    title: 'Transfer',
    actions: (
      <Button variant="ghost" size="sm">
        Export
      </Button>
    ),
    children: <p className="text-xs text-zinc-400">Export or import profiles.</p>,
  },
};

/**
 * `renderHeader` — 헤더 행 전체를 호출자가 감싼다. 접이식 패널이 이 형태로 행 전체를
 * 클릭 대상으로 만든다(ui-polish 09). 우측 슬롯은 트리거 **안쪽**에 놓이므로
 * 포커스 가능한 요소를 넣으면 안 된다.
 */
export const CustomHeaderElement: Story = {
  args: {
    title: 'Preferences',
    actions: <ChevronDown size={14} strokeWidth={1.75} className="shrink-0" />,
    renderHeader: ({ className, children }) => (
      <button type="button" className={`min-h-6 cursor-pointer rounded-md px-1 text-left ${className}`}>
        {children}
      </button>
    ),
    children: <p className="text-xs text-zinc-400">Header row is one big click target.</p>,
  },
};
