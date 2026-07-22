import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Modification } from '@/core/schema';
import { RuleRow } from './rule-row';

const meta = {
  title: 'Popup/RuleRow',
  component: RuleRow,
  args: { onToggleEnabled: () => {}, onEdit: () => {}, onRemove: () => {} },
} satisfies Meta<typeof RuleRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const header: Modification = {
  kind: 'request-header',
  id: 'm1',
  name: 'X-Test',
  value: 'aaa',
  enabled: true,
  mode: 'override',
  emptyMeans: 'remove',
  comment: 'test',
};

export const RequestHeader: Story = { args: { modification: header } };

export const WithScope: Story = {
  args: { modification: { ...header, name: 'x-test', value: 'aaa', urlFilter: 'imtest.me/' } },
};

export const AppendMode: Story = {
  args: { modification: { ...header, name: 'Accept', value: 'application/json', mode: 'append', comment: '' } },
};

export const Redirect: Story = {
  args: {
    modification: {
      kind: 'redirect',
      id: 'r1',
      pattern: '^https://prod\\.example\\.com/(.*)',
      substitution: 'http://localhost:3000/\\1',
      enabled: true,
      comment: 'to local',
    },
  },
};

export const Csp: Story = {
  args: {
    modification: {
      kind: 'csp',
      id: 'c1',
      directives: [
        { name: 'default-src', value: "'self'" },
        { name: 'img-src', value: 'data:' },
      ],
      enabled: false,
      comment: '',
    },
  },
};
