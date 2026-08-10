import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SelectOptions, type SelectOptionsProps } from './select-options';

const meta = {
  title: 'UI/SelectOptions',
  component: SelectOptions,
} satisfies Meta<typeof SelectOptions>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 종류 셀렉트의 **실제** 옵션 여덟 (`KIND_LABELS` → i18n). 앱에서 가장 긴 라벨이
 * 여기 있으므로(en `Response header`, ko `User-Agent 변경`) 고정 폭의 근거가 서는 자리다.
 *
 * 예전 스토리는 이미 퇴역한 라벨(`Regex (advanced)`·`URL starts with`)로 폭을 보여 주고
 * 있었다 — 앱이 쓰지 않는 문자열로 재는 폭은 근거가 아니다.
 */
const kindOptionsEn = [
  { value: 'request-header', label: 'Request header' },
  { value: 'response-header', label: 'Response header' },
  { value: 'cookie', label: 'Request cookie' },
  { value: 'set-cookie', label: 'Response cookie' },
  { value: 'redirect', label: 'Redirect' },
  { value: 'user-agent', label: 'User-Agent' },
  { value: 'header-removal', label: 'Remove header' },
  { value: 'block', label: 'Block request' },
];

const kindOptionsKo = [
  { value: 'request-header', label: '요청 헤더' },
  { value: 'response-header', label: '응답 헤더' },
  { value: 'cookie', label: '요청 쿠키' },
  { value: 'set-cookie', label: '응답 쿠키' },
  { value: 'redirect', label: '리다이렉트' },
  { value: 'user-agent', label: 'User-Agent 변경' },
  { value: 'header-removal', label: '헤더 삭제' },
  { value: 'block', label: '요청 차단' },
];

/** 매치 방식은 둘뿐이다 — 스키마의 domain·prefix는 와일드카드로 접혀 화면에 안 나온다. */
const matchTypeEn = [
  { value: 'contains', label: 'Wildcard' },
  { value: 'regex', label: 'Regex' },
];

const matchTypeKo = [
  { value: 'contains', label: '와일드카드' },
  { value: 'regex', label: '정규식' },
];

function Interactive(args: SelectOptionsProps<string>) {
  const [value, setValue] = useState(args.value);
  return <SelectOptions {...args} value={value} onValueChange={setValue} />;
}

export const Default: Story = {
  args: {
    value: 'response-header',
    onValueChange: () => {},
    options: kindOptionsEn,
    'aria-label': 'Type',
  },
  render: (args) => <Interactive {...args} />,
};

/**
 * 폭 계약 — **앱의 모든 셀렉트가 같은 폭이다.**
 *
 * 옵션 수도 라벨 길이도 다른 두 셀렉트를 나란히 둔다. 값을 바꿔도 두 트리거의 오른쪽 변이
 * 같은 자리에 서야 하고, 팝업을 열었을 때 어느 라벨도 잘리지 않아야 한다 — 폭이 값이나
 * 자리에 따라 변하던 시절에는 종류 팝업의 긴 라벨이 조용히 잘렸다.
 */
export const FixedWidth: Story = {
  args: {
    value: 'response-header',
    onValueChange: () => {},
    options: kindOptionsEn,
    'aria-label': 'Type',
  },
  render: (args) => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <Interactive {...args} />
        <span className="text-xs text-zinc-500">종류 — 최장 라벨 `Response header`</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Interactive {...args} value="contains" options={matchTypeEn} aria-label="URL match type" />
        <span className="text-xs text-zinc-500">매치 방식 — 옆 입력이 밀리지 않게 같은 폭</span>
      </div>
    </div>
  ),
};

/** ko 최장 라벨(`User-Agent 변경`)도 같은 토큰 하나에 담긴다 — 두 로케일이 같은 폭이다. */
export const FixedWidthKo: Story = {
  args: {
    value: 'user-agent',
    onValueChange: () => {},
    options: kindOptionsKo,
    'aria-label': '종류',
  },
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Interactive {...args} />
      <Interactive {...args} value="contains" options={matchTypeKo} aria-label="URL 매치 방식" />
    </div>
  ),
};
