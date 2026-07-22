import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProfileSection } from '@/features/profiles/profile-section';
import { StatusSummary } from '@/features/status/status-summary';
import type { Profile } from '@/core/schema';

/**
 * 탭 앱 레이아웃 미리보기 — 실제 App은 브라우저 저장소에 의존하므로,
 * 넓은 마운트(surface='tab')의 시각적 골격만 정적으로 조립해 보여준다.
 */
const meta = {
  title: 'App/TabLayout',
} satisfies Meta;

export default meta;
type Story = StoryObj;

const profile: Profile = {
  id: 'p1',
  name: 'Staging API',
  active: true,
  shortLabel: 'ST',
  color: '#d97706',
  modifications: [
    { kind: 'request-header', id: 'm1', name: 'Authorization', value: 'Bearer test', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
  ],
};

export const Wide: Story = {
  render: () => (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-3 bg-white p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">HeaderKit</h1>
        <span className="text-xs text-zinc-400">tab app</span>
      </div>
      <StatusSummary
        summary={{
          ruleCount: 1,
          activeProfileCount: 1,
          paused: false,
          applyError: null,
          warnings: [],
          hasProblems: false,
        }}
      />
      <ProfileSection profile={profile} onCommand={() => {}} onDeleteRule={() => {}} onCommandWithResult={async () => ({ ok: true })} />
    </main>
  ),
};
