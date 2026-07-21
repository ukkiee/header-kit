import type { Meta, StoryObj } from '@storybook/react-vite';
import { SwitcherChip } from './switcher-chip';

const meta = {
  title: 'UI/SwitcherChip',
  component: SwitcherChip,
} satisfies Meta<typeof SwitcherChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unselected: Story = { args: { selected: false, children: 'Staging API' } };
export const Selected: Story = { args: { selected: true, children: 'Staging API' } };
