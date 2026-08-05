import type { Meta, StoryObj } from '@storybook/react-vite';
import { STANDARD_HEADERS, suggestHeaderNames, USER_AGENT_PRESETS } from '@/core/autocomplete';
import SuggestAutocomplete from './suggest-autocomplete';

/**
 * 렌더 게이트 — 이 표면은 규칙 폼을 열고 타이핑해야 나타나므로 스모크 밖에서는
 * 스토리북이 유일한 렌더 확인 지점이다. 후보는 실제 산출 함수로 만든다.
 */
const meta = {
  title: 'Features/SuggestAutocomplete',
  component: SuggestAutocomplete,
  args: {
    label: 'Header name',
    onChange: () => {},
  },
} satisfies Meta<typeof SuggestAutocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { value: '', suggestions: suggestHeaderNames('') },
};

/** 사용자 항목이 표준 헤더보다 앞선다 — 순서는 core가 정한다. */
export const UserEntryFirst: Story = {
  args: {
    value: 'X',
    suggestions: suggestHeaderNames('X', ['X-Team-Custom']),
  },
};

/** 후보가 없으면 팝업 자체가 렌더되지 않는다 (빈 상자·바깥 aria-hidden 방지). */
export const NoSuggestions: Story = {
  args: { value: 'ZZZ-No-Match', suggestions: [] },
};

export const AllStandard: Story = {
  args: { value: '', suggestions: STANDARD_HEADERS.map((name) => ({ label: name, value: name })) },
};

/**
 * **라벨과 값이 다른 표현** (티켓 08) — User-Agent만 여기에 해당한다.
 *
 * 목록에는 사람이 아는 이름이 서고 고르면 전체 문자열이 들어간다. 헤더·쿠키는 둘이 같아
 * 이 차이가 드러나지 않으므로, 스토리북에서 그것을 눈으로 확인할 수 있는 자리는 여기뿐이다.
 */
export const UserAgentLabels: Story = {
  args: {
    value: '',
    label: 'User-Agent',
    placeholder: 'Mozilla/5.0 …',
    suggestions: USER_AGENT_PRESETS,
  },
};
