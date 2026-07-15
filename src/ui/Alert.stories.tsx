import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert } from './Alert';

const meta = {
  title: 'UI/Alert',
  component: Alert,
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = { args: { severity: 'info', children: 'Enable this extension in incognito.' } };
export const Warn: Story = { args: { severity: 'warn', children: 'All modifications paused.' } };
export const Danger: Story = { args: { severity: 'danger', size: 'xs', children: 'Not valid JSON.' } };
