import type { Meta, StoryObj } from '@storybook/react-vite';
import { Layers, Pencil, Trash2 } from 'lucide-react';
import { IconButton } from './icon-button';

const meta = {
  title: 'UI/IconButton',
  component: IconButton,
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Edit: Story = { args: { label: 'Edit', icon: Pencil } };
export const DeleteDanger: Story = { args: { label: 'Delete', icon: Trash2, tone: 'danger' } };
/** aria-label(label)은 유지한 채 툴팁 문구만 덮어쓰는 케이스. */
export const TooltipOverride: Story = { args: { label: 'Restore backup', tooltip: 'Restore', icon: Pencil } };

/**
 * 크기 변형 — `sm`(24×24/14px)은 행 안에 여럿 늘어서는 반복 액션, `md`(32×28/16px)는
 * 단독으로 서는 내비게이션(레일). 레일을 sm으로 두면 클릭 대상이 줄어든다.
 */
export const Sizes: Story = {
  args: { label: 'Show profiles', icon: Layers },
  render: (args) => (
    <div className="flex items-center gap-3">
      <IconButton {...args} size="sm" label="Edit" icon={Pencil} />
      <IconButton {...args} size="md" />
    </div>
  ),
};

/** 선택 상태 — 레일이 현재 화면을 이렇게 표시한다(aria-pressed + 배경). */
export const SelectedNavigation: Story = {
  args: {
    label: 'Show profiles',
    icon: Layers,
    size: 'md',
    'aria-pressed': true,
    className: 'bg-zinc-100 dark:bg-zinc-800',
  },
};
