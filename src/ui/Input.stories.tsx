import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './Input';

const meta = {
  title: 'UI/Input',
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Solid: Story = { args: { defaultValue: 'Bearer token', placeholder: 'value' } };
export const SolidMono: Story = { args: { defaultValue: '^https://prod\\.example', font: 'mono' } };
export const Small: Story = { args: { defaultValue: 'default-src', size: 'sm' } };
export const Ghost: Story = { args: { defaultValue: 'comment', variant: 'ghost', size: 'xs' } };
export const Center: Story = { args: { defaultValue: 'ST', align: 'center', className: 'w-10' } };
