import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pill } from './pill';

const meta = {
  title: 'UI/Pill',
  component: Pill,
} satisfies Meta<typeof Pill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = { args: { tone: 'neutral', children: 'X-My-Header' } };
export const Danger: Story = { args: { tone: 'danger', children: 'corrupt' } };
