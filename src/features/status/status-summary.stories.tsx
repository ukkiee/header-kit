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
        {
          code: 'header-overlap',
          label: 'Overlapping header across profiles',
          detail: 'Multiple active profiles modify "authorization"; the highest profile wins.',
        },
        {
          code: 'quota-exceeded',
          label: 'Rule limit exceeded',
          detail: 'Session rule limit (5000) exceeded; some modifications are not applied.',
        },
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
