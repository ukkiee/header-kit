import type { Meta, StoryObj } from '@storybook/react-vite';
import { FieldLabeled } from './field-labeled';
import { Input } from './text-field';

const meta = {
  title: 'UI/Field',
  component: FieldLabeled,
} satisfies Meta<typeof FieldLabeled>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithInput: Story = {
  args: { label: 'Header name', children: null },
  render: (args) => (
    <FieldLabeled {...args}>
      <Input placeholder="X-Custom-Header" />
    </FieldLabeled>
  ),
};
