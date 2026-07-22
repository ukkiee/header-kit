import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Modification } from '@/core/schema';
import { RuleForm } from './rule-form';

const meta = {
  title: 'Popup/RuleForm',
  component: RuleForm,
  args: { onSave: async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true }), onCancel: () => {} },
} satisfies Meta<typeof RuleForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};

const redirect: Modification = {
  kind: 'redirect',
  id: 'r1',
  pattern: '^https://prod\\.example\\.com/(.*)',
  substitution: 'http://localhost:3000/\\1',
  enabled: true,
  comment: '',
};

export const EditRedirect: Story = { args: { initial: redirect } };

export const RejectedSave: Story = {
  args: {
    initial: redirect,
    onSave: async () => ({ ok: false, error: 'Invalid regex pattern (syntaxError)' }),
  },
};
