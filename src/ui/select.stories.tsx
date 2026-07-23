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

function Interactive(args: SelectProps<string>) {
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

/** 매치 방식 라벨 — 최장(en)과 최단(ko)이 같은 폭에 담기는지 보는 자리. */
const matchTypeOptions = [
  { value: 'contains', label: 'URL contains' },
  { value: 'domain', label: 'Domain' },
  { value: 'prefix', label: 'URL starts with' },
  { value: 'regex', label: 'Regex (advanced)' },
];

/**
 * 폭 변형 — 값에 따라 폭이 변하지 않아야 하는 자리(옆에 다른 컨트롤이 있는 행)에 쓴다.
 * 기본값인 `auto`와 나란히 두어 차이가 보이게 한다.
 */
export const FixedWidth: Story = {
  args: {
    width: 'fixed',
    size: 'md',
    value: 'regex',
    onValueChange: () => {},
    options: matchTypeOptions,
    'aria-label': 'URL match type',
  },
  render: (args) => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <Interactive {...args} />
        <span className="text-xs text-zinc-500">fixed — 값을 바꿔도 폭이 그대로다</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Interactive {...args} width="auto" />
        <span className="text-xs text-zinc-500">auto — 값에 따라 폭이 변한다</span>
      </div>
    </div>
  ),
};

/** ko 최장 라벨은 en보다 짧다 — 같은 토큰 하나가 두 로케일을 모두 담는다(story 3). */
export const FixedWidthKo: Story = {
  args: {
    width: 'fixed',
    size: 'md',
    value: 'regex',
    onValueChange: () => {},
    options: [
      { value: 'contains', label: 'URL 포함' },
      { value: 'domain', label: '도메인' },
      { value: 'prefix', label: 'URL 시작' },
      { value: 'regex', label: '정규식 (고급)' },
    ],
    'aria-label': 'URL 매치 방식',
  },
  render: (args) => <Interactive {...args} />,
};
