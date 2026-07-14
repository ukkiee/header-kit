import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { applyCommand, type Command } from '@/core/commands';
import type { StoredState } from '@/core/schema';
import { SCHEMA_VERSION } from '@/core/schema';
import { TransferPanel } from './TransferPanel';

const meta = {
  title: 'Popup/TransferPanel',
  component: TransferPanel,
} satisfies Meta<typeof TransferPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleState: StoredState = {
  schemaVersion: SCHEMA_VERSION,
  paused: false,
  profiles: [
    {
      id: 'p1',
      name: 'Staging',
      active: true,
      shortLabel: 'ST',
      color: '#d97706',
      modifications: [
        { kind: 'request-header', id: 'm1', name: 'Authorization', value: 'Bearer x', enabled: true },
      ],
      filters: [],
    },
    {
      id: 'p2',
      name: 'QA flags',
      active: false,
      shortLabel: 'QA',
      color: '#16a34a',
      modifications: [],
      filters: [],
    },
  ],
  materialized: {},
};

function InteractiveTransferPanel() {
  const [state, setState] = useState(sampleState);
  const onCommand = (command: Command) => setState((s) => applyCommand(s, command));
  return (
    <div className="w-96">
      <TransferPanel state={state} onCommand={onCommand} download={() => {}} />
      <p className="mt-2 text-xs text-zinc-400">{state.profiles.length} profiles in state</p>
    </div>
  );
}

export const Default: Story = {
  args: { state: sampleState, onCommand: () => {} },
  render: () => <InteractiveTransferPanel />,
};
