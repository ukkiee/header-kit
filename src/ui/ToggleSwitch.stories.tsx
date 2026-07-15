import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToggleSwitch } from './ToggleSwitch';

const meta = {
  title: 'UI/ToggleSwitch',
  component: ToggleSwitch,
} satisfies Meta<typeof ToggleSwitch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const On: Story = { args: { defaultChecked: true, 'aria-label': 'Toggle profile' } };
export const Off: Story = { args: { defaultChecked: false, 'aria-label': 'Toggle profile' } };
