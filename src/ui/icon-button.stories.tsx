import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pencil, Trash2 } from 'lucide-react';
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
