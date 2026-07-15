import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SnapshotStatus } from '@/core/backup';
import { BackupPanel } from './backup-panel';

const meta = {
  title: 'Popup/BackupPanel',
  component: BackupPanel,
} satisfies Meta<typeof BackupPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const snapshots: SnapshotStatus[] = [
  {
    id: 's-recent',
    createdAt: 1789500000000,
    chunkCount: 1,
    checksum: 'aabbccdd',
    profileCount: 3,
    status: 'ok',
  },
  {
    id: 's-corrupt',
    createdAt: 1789400000000,
    chunkCount: 2,
    checksum: '00112233',
    profileCount: 2,
    status: 'corrupt',
    reason: 'checksum mismatch',
  },
];

export const WithSnapshots: Story = {
  args: {
    onCommand: async () => ({ ok: true }),
    loadSnapshots: async () => snapshots,
    loadSnapshotText: async () => ({
      ok: true,
      text: JSON.stringify({ headerkit: 1, profiles: [] }),
    }),
  },
};

export const Empty: Story = {
  args: {
    onCommand: async () => ({ ok: true }),
    loadSnapshots: async () => [],
  },
};
