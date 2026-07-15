import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './card';

const meta = {
  title: 'UI/Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Outlined: Story = { args: { variant: 'outlined', className: 'text-sm', children: 'Profile card' } };
export const Filled: Story = { args: { variant: 'filled', className: 'text-xs', children: '1 rule · 1 active profile' } };
export const Row: Story = { args: { variant: 'row', className: 'text-sm', children: 'Modification row' } };
