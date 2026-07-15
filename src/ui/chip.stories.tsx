import type { Meta, StoryObj } from '@storybook/react-vite';
import { Chip } from './chip';

const meta = {
  title: 'UI/Chip',
  component: Chip,
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChipInactive: Story = { args: { active: false, children: 'override' } };
export const ChipActive: Story = { args: { active: true, children: 'override' } };
