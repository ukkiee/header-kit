import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { applyCommand, type Command } from '@/core/commands';
import { SCHEMA_VERSION } from '@/core/schema';
import type { ThemePreference } from '@/core/theme';
import { PreferencesPanel } from './preferences-panel';

const meta = {
  title: 'Popup/PreferencesPanel',
  component: PreferencesPanel,
} satisfies Meta<typeof PreferencesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function Interactive({ incognitoAllowed }: { incognitoAllowed: boolean }) {
  const [names, setNames] = useState<string[]>(['X-Team-Token']);
  // 테마 칩도 실제로 눌러 볼 수 있어야 한다 — 고정값이면 스토리에서 선택이 죽어 보인다.
  const [theme, setTheme] = useState<ThemePreference>('system');
  const onCommand = (command: Command) => {
    const state = applyCommand(
      {
        schemaVersion: SCHEMA_VERSION,
        paused: false,
        theme,
        profiles: [],
        materialized: {},
        customHeaderNames: names,
      },
      command,
    );
    setNames(state.customHeaderNames);
    setTheme(state.theme);
  };
  return (
    <div className="w-96">
      <PreferencesPanel
        customHeaderNames={names}
        theme={theme}
        onCommand={onCommand}
        incognitoAllowed={incognitoAllowed}
      />
    </div>
  );
}

export const IncognitoBlocked: Story = {
  args: { customHeaderNames: [], theme: 'system', onCommand: () => {}, incognitoAllowed: false },
  render: () => <Interactive incognitoAllowed={false} />,
};

export const IncognitoAllowed: Story = {
  args: { customHeaderNames: [], theme: 'system', onCommand: () => {}, incognitoAllowed: true },
  render: () => <Interactive incognitoAllowed={true} />,
};
