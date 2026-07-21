import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Profile } from '@/core/schema';
import { ProfileChips } from './profile-chips';

const meta = {
  title: 'Popup/ProfileChips',
  component: ProfileChips,
  args: { onSelect: () => {}, onCreate: () => {} },
} satisfies Meta<typeof ProfileChips>;

export default meta;
type Story = StoryObj<typeof meta>;

const profile = (id: string, name: string, active: boolean, color = '#2563eb'): Profile => ({
  id,
  name,
  active,
  shortLabel: name.slice(0, 2),
  color,
  modifications: [],
  filters: [],
});

const three = [
  profile('a', '스테이징 API', true, '#d97706'),
  profile('b', 'Local mock', false),
  profile('c', 'CORS 해제', true, '#16a34a'),
];

export const Default: Story = { args: { profiles: three, selectedId: 'a' } };

export const InactiveSelected: Story = { args: { profiles: three, selectedId: 'b' } };

export const ManyProfilesWrap: Story = {
  args: {
    profiles: [
      ...three,
      profile('d', '아주 길고 긴 프로필 이름은 잘려야 한다 truncate', false),
      profile('e', 'Another very long profile name for boundary', true, '#dc2626'),
      profile('f', 'QA', false),
      profile('g', 'Perf', true, '#7c3aed'),
    ],
    selectedId: 'e',
  },
  parameters: { viewport: { defaultViewport: 'mobile2' } },
};

export const Empty: Story = { args: { profiles: [], selectedId: null } };
