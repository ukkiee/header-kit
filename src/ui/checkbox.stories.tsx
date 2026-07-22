import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Checkbox, type CheckboxProps } from './checkbox';

const meta = {
  title: 'UI/Checkbox',
  component: Checkbox,
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

function Interactive(args: CheckboxProps) {
  const [checked, setChecked] = useState(args.checked);
  return <Checkbox {...args} checked={checked} onCheckedChange={setChecked} />;
}

export const Checked: Story = {
  args: { checked: true, onCheckedChange: () => {}, 'aria-label': 'Enable' },
  render: (args) => <Interactive {...args} />,
};
export const Unchecked: Story = {
  args: { checked: false, onCheckedChange: () => {}, 'aria-label': 'Enable' },
  render: (args) => <Interactive {...args} />,
};
