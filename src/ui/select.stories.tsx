import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select } from './select';

const meta = {
  title: 'UI/Select',
  component: Select,
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const options = (
  <>
    <option>Request header</option>
    <option>Response header</option>
  </>
);

export const Bordered: Story = { args: { variant: 'bordered', size: 'md', children: options } };
export const Ghost: Story = { args: { variant: 'ghost', size: 'sm', children: options } };
