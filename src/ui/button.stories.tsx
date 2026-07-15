import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';

const meta = {
  title: 'UI/Button',
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ButtonPrimary: Story = { args: { children: 'Primary', variant: 'primary' } };
export const ButtonGhost: Story = { args: { children: 'Ghost', variant: 'ghost' } };
export const ButtonDanger: Story = { args: { children: 'Danger', variant: 'danger' } };
export const ButtonSmall: Story = { args: { children: 'Small', size: 'sm' } };
