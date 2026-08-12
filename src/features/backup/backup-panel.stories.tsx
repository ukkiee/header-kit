import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SnapshotStatus } from '@/core/backup';
import { ToastProvider } from '@/ui/toaster';
import { BackupPanel } from './backup-panel';

/**
 * 토스트 Provider로 감싼다 — 패널이 성공 알림을 토스트로 띄우므로(`useToastManager`) 감싸지
 * 않으면 스토리를 여는 순간 던진다. 두 엔트리(`popup`·`app`)가 셸을 감싸는 것과 같은 배치라,
 * 스토리가 실제 화면과 다른 조건에서 그려지지 않는다.
 */
const meta = {
  title: 'Popup/BackupPanel',
  component: BackupPanel,
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
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
    syncBackup: true,
    onCommand: async () => ({ ok: true }),
    onRestore: async () => ({ ok: true }),
    loadSnapshots: async () => snapshots,
    loadSnapshotText: async () => ({
      ok: true,
      text: JSON.stringify({ headerkit: 1, profiles: [] }),
    }),
    loadCloudPresence: async () => true,
    clearCloud: async () => ({ ok: true }),
    // 한 행 삭제도 효과다 — 스토리에서는 성공만 흉내 내고 저장소를 만지지 않는다.
    deleteSnapshot: async () => ({ ok: true }),
  },
};

export const Empty: Story = {
  args: {
    syncBackup: true,
    onCommand: async () => ({ ok: true }),
    onRestore: async () => ({ ok: true }),
    loadSnapshots: async () => [],
    loadCloudPresence: async () => false,
    clearCloud: async () => ({ ok: true }),
  },
};

/** 동기화를 껐지만 클라우드에는 아직 백업이 남아 있는 상태 — 삭제는 별도 동작이다. */
export const SyncOffCloudResidue: Story = {
  args: {
    syncBackup: false,
    onCommand: async () => ({ ok: true }),
    onRestore: async () => ({ ok: true }),
    loadSnapshots: async () => [],
    loadCloudPresence: async () => true,
    clearCloud: async () => ({ ok: false, error: '2 backup key(s) still in cloud storage' }),
  },
};
