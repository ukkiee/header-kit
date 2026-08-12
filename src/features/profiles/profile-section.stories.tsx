import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { applyCommand, type Command } from '@/core/commands';
import type { Profile, StoredState } from '@/core/schema';
import { SCHEMA_VERSION } from '@/core/schema';
import { ProfileSection } from './profile-section';

const meta = {
  title: 'Popup/ProfileSection',
  component: ProfileSection,
} satisfies Meta<typeof ProfileSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleProfile: Profile = {
  id: 'p1',
  name: 'Staging API',
  active: true,
  color: '#d97706',
  modifications: [
    {
      kind: 'request-header',
      id: 'm1',
      name: 'Authorization',
      value: 'Bearer test-token',
      enabled: true,
      mode: 'override',
      emptyMeans: 'remove',
      comment: '',
    },
    {
      kind: 'request-header',
      id: 'm2',
      name: 'X-Feature-Flag',
      value: 'beta',
      enabled: false,
      mode: 'override',
      emptyMeans: 'remove',
      comment: '',
    },
  ],
};

function InteractiveProfileSection({ initial }: { initial: Profile }) {
  const [state, setState] = useState<StoredState>({
    schemaVersion: SCHEMA_VERSION,
    paused: false,
    theme: 'system',
    badgeVisible: true,
    syncBackup: true,
    profiles: [initial],
    materialized: {},
    customHeaderNames: [],
    customCookieNames: [],
    customUserAgents: [],
  });
  const profile = state.profiles[0];
  if (!profile) return <p className="text-sm">Profile deleted.</p>;
  const onCommand = (command: Command) => setState((s) => applyCommand(s, command));
  const onCommandWithResult = async (command: Command) => {
    setState((s) => applyCommand(s, command));
    return { ok: true };
  };
  const onDeleteRule = (profileId: string, modificationId: string) =>
    setState((s) => applyCommand(s, { type: 'remove-modification', profileId, modificationId }));
  // 드래그 재정렬도 앱과 같은 명령으로 귀결된다 — 스토리에서 실제로 순서가 바뀌어야
  // 드롭 후 되돌아가는 애니메이션 같은 것이 여기서 보인다.
  const onReorderRule = async (modificationId: string, toIndex: number) => {
    setState((s) =>
      applyCommand(s, { type: 'move-modification', profileId: profile.id, modificationId, toIndex }),
    );
  };
  // 앱에서는 셸이 드는 상태 — 스토리에서는 이 래퍼가 그 자리를 대신한다.
  const [editingRule, setEditingRule] = useState<'new' | string | null>(null);
  return (
    <ProfileSection
      profile={profile}
      paused={false}
      onCommand={onCommand}
      onDeleteRule={onDeleteRule}
      onCommandWithResult={onCommandWithResult}
      editingRule={editingRule}
      onEditingRuleChange={setEditingRule}
      onOpenRuleForm={setEditingRule}
      onReorderRule={onReorderRule}
    />
  );
}

export const Active: Story = {
  args: {
    profile: sampleProfile,
    paused: false,
    onCommand: () => {},
    onDeleteRule: () => {},
    onCommandWithResult: async () => ({ ok: true }),
    editingRule: null,
    onEditingRuleChange: () => {},
    onOpenRuleForm: () => {},
    onReorderRule: async () => {},
  },
  render: (args) => <InteractiveProfileSection initial={args.profile} />,
};

export const Inactive: Story = {
  args: {
    profile: { ...sampleProfile, active: false, modifications: [] },
    paused: false,
    onCommand: () => {},
    onDeleteRule: () => {},
    onCommandWithResult: async () => ({ ok: true }),
    editingRule: null,
    onEditingRuleChange: () => {},
    onOpenRuleForm: () => {},
    onReorderRule: async () => {},
  },
  render: (args) => <InteractiveProfileSection initial={args.profile} />,
};
