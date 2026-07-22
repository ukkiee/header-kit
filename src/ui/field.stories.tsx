import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field } from './field';
import { Input } from './input';

const meta = {
  title: 'UI/Field',
  component: Field,
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithInput: Story = {
  args: { label: 'Header name', children: null },
  render: (args) => (
    <Field {...args}>
      <Input placeholder="X-Custom-Header" />
    </Field>
  ),
};
