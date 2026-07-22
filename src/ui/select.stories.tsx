import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Select, type SelectProps } from './select';

const meta = {
  title: 'UI/Select',
  component: Select,
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const options = [
  { value: 'request-header', label: 'Request header' },
  { value: 'response-header', label: 'Response header' },
];

function Interactive(args: SelectProps) {
  const [value, setValue] = useState(args.value);
  return <Select {...args} value={value} onValueChange={setValue} />;
}

export const Bordered: Story = {
  args: { variant: 'bordered', size: 'md', value: 'request-header', onValueChange: () => {}, options, 'aria-label': 'Kind' },
  render: (args) => <Interactive {...args} />,
};
export const Ghost: Story = {
  args: { variant: 'ghost', size: 'sm', value: 'response-header', onValueChange: () => {}, options, 'aria-label': 'Kind' },
  render: (args) => <Interactive {...args} />,
};
