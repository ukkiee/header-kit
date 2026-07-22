import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ChipGroup, type ChipGroupProps } from './chip-group';

const meta = {
  title: 'UI/ChipGroup',
  component: ChipGroup,
} satisfies Meta<typeof ChipGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

const options = [
  { value: 'script', label: 'script' },
  { value: 'image', label: 'image' },
  { value: 'xmlhttprequest', label: 'xmlhttprequest' },
];

function Interactive(args: ChipGroupProps<string>) {
  const [values, setValues] = useState<string[]>([...args.values]);
  return <ChipGroup {...args} values={values} onValuesChange={setValues} />;
}

export const MultiSelect: Story = {
  args: { values: ['script'], options, onValuesChange: () => {}, 'aria-label': 'Resource types' },
  render: (args) => <Interactive {...args} />,
};
