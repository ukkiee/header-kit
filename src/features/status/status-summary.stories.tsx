import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StatusSummary as StatusSummaryData } from '@/core/summary';
import { StatusSummary } from './status-summary';

const meta = {
  title: 'Popup/StatusSummary',
  component: StatusSummary,
} satisfies Meta<typeof StatusSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

const clean: StatusSummaryData = {
  ruleCount: 4,
  activeProfileCount: 2,
  paused: false,
  applyError: null,
  warnings: [],
  hasProblems: false,
};

export const Clean: Story = { args: { summary: clean } };

export const WithWarnings: Story = {
  args: {
    summary: {
      ...clean,
      hasProblems: true,
      warnings: [
        { code: 'header-overlap', params: { header: 'authorization' } },
        { code: 'quota-exceeded', params: { quota: 'total-rules', limit: 5000 } },
      ],
    },
  },
};

export const ApplyError: Story = {
  args: {
    summary: { ...clean, hasProblems: true, applyError: 'Session rule count exceeded.' },
  },
};

export const Paused: Story = {
  args: { summary: { ...clean, ruleCount: 0, activeProfileCount: 0, paused: true } },
};
