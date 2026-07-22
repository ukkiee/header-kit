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
  shortLabel: 'ST',
  color: '#d97706',
  modifications: [
    { kind: 'request-header', id: 'm1', name: 'Authorization', value: 'Bearer test-token', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
    { kind: 'request-header', id: 'm2', name: 'X-Feature-Flag', value: 'beta', enabled: false, mode: 'override', emptyMeans: 'remove', comment: '' },
  ],
  filters: [
    { kind: 'url', id: 'f1', enabled: true, pattern: 'api\\.staging\\.example\\.com' },
    { kind: 'resource-type', id: 'f2', enabled: true, resourceTypes: ['xmlhttprequest', 'script'] },
  ],
};

function InteractiveProfileSection({ initial }: { initial: Profile }) {
  const [state, setState] = useState<StoredState>({
    schemaVersion: SCHEMA_VERSION,
    paused: false,
    profiles: [initial],
    materialized: {},
    customHeaderNames: [],
  });
  const profile = state.profiles[0];
  if (!profile) return <p className="text-sm">Profile deleted.</p>;
  const onCommand = (command: Command) => setState((s) => applyCommand(s, command));
  const onCommandWithResult = async (command: Command) => {
    setState((s) => applyCommand(s, command));
    return { ok: true };
  };
  return (
    <ProfileSection
      profile={profile}
      index={0}
      profileCount={1}
      onCommand={onCommand}
      onCommandWithResult={onCommandWithResult}
    />
  );
}

export const Active: Story = {
  args: {
    profile: sampleProfile,
    index: 0,
    profileCount: 1,
    onCommand: () => {},
    onCommandWithResult: async () => ({ ok: true }),
  },
  render: (args) => <InteractiveProfileSection initial={args.profile} />,
};

export const Inactive: Story = {
  args: {
    profile: { ...sampleProfile, active: false, modifications: [], filters: [] },
    index: 0,
    profileCount: 1,
    onCommand: () => {},
    onCommandWithResult: async () => ({ ok: true }),
  },
  render: (args) => <InteractiveProfileSection initial={args.profile} />,
};
