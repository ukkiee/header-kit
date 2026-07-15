import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { applyCommand, type Command } from '@/core/commands';
import { PreferencesPanel } from './PreferencesPanel';

const meta = {
  title: 'Popup/PreferencesPanel',
  component: PreferencesPanel,
} satisfies Meta<typeof PreferencesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function Interactive({ incognitoAllowed }: { incognitoAllowed: boolean }) {
  const [names, setNames] = useState<string[]>(['X-Team-Token']);
  const onCommand = (command: Command) => {
    const state = applyCommand(
      {
        schemaVersion: 1,
        paused: false,
        profiles: [],
        materialized: {},
        customHeaderNames: names,
      },
      command,
    );
    setNames(state.customHeaderNames);
  };
  return (
    <div className="w-96">
      <PreferencesPanel
        customHeaderNames={names}
        onCommand={onCommand}
        incognitoAllowed={incognitoAllowed}
        locale="en"
      />
    </div>
  );
}

export const IncognitoBlocked: Story = {
  args: { customHeaderNames: [], onCommand: () => {}, incognitoAllowed: false, locale: 'en' },
  render: () => <Interactive incognitoAllowed={false} />,
};

export const IncognitoAllowed: Story = {
  args: { customHeaderNames: [], onCommand: () => {}, incognitoAllowed: true, locale: 'en' },
  render: () => <Interactive incognitoAllowed={true} />,
};
