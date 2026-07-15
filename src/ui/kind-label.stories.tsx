import type { Meta, StoryObj } from '@storybook/react-vite';
import { KindLabel } from './kind-label';

const meta = {
  title: 'UI/KindLabel',
  component: KindLabel,
} satisfies Meta<typeof KindLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Csp: Story = { args: { children: 'CSP' } };
export const Redirect: Story = { args: { children: 'Redirect' } };
