import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertBanner } from './alert-banner';

const meta = {
  title: 'UI/AlertBanner',
  component: AlertBanner,
} satisfies Meta<typeof AlertBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: { severity: 'info', children: 'Enable this extension in incognito.' },
};
export const Warn: Story = { args: { severity: 'warn', children: 'All modifications paused.' } };
export const Danger: Story = {
  args: { severity: 'danger', size: 'xs', children: 'Not valid JSON.' },
};

/** 여러 줄 — 행간이 크기와 함께 오는지 보는 자리(ui-review UI-16). */
export const MultiLine: Story = {
  args: {
    severity: 'info',
    children:
      '시크릿 창에서 활성화되지 않았습니다. 시크릿 트래픽을 수정하려면 확장 상세 페이지에서 "시크릿 모드에서 허용"을 켜세요.',
  },
};

/** 목록 시맨틱 — shadcn Alert(div 고정)를 쓰지 않는 이유가 이 자리다. */
export const AsList: Story = {
  args: {
    as: 'ul',
    severity: 'danger',
    size: 'xs',
    children: (
      <>
        <li>profiles[0].name: required</li>
        <li>profiles[1].modifications: expected array</li>
      </>
    ),
  },
};
