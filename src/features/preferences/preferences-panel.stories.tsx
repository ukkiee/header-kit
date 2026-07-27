import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { applyCommand, type Command } from '@/core/commands';
import type { Locale } from '@/core/i18n';
import { SCHEMA_VERSION } from '@/core/schema';
import type { RegisteredCommand } from '@/core/shortcuts';
import type { ThemePreference } from '@/core/theme';
import { PreferencesPanel } from './preferences-panel';

/**
 * 스토리북에는 확장 API가 없다 — 등록된 커맨드는 manifest가 선언한 그대로 흉내 낸다.
 * 목록이 읽기 전용이라 이 고정값으로도 화면이 하는 일을 전부 보여 준다.
 */
const storyShortcuts = (): Promise<RegisteredCommand[]> =>
  Promise.resolve([
    { name: '_execute_action', shortcut: 'Alt+Shift+H' },
    { name: 'toggle-pause', shortcut: 'Alt+Shift+P' },
  ]);

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
  const [badgeVisible, setBadgeVisible] = useState(true);
  // 언어 칩도 같은 이유로 살아 있어야 한다 — 스토리는 en에서 시작한다.
  const [locale, setLocale] = useState<Locale>('en');
  const onCommand = (command: Command) => {
    const state = applyCommand(
      {
        schemaVersion: SCHEMA_VERSION,
        paused: false,
        theme,
        locale,
        badgeVisible,
        syncBackup: true,
        profiles: [],
        materialized: {},
        customHeaderNames: names,
      },
      command,
    );
    setNames(state.customHeaderNames);
    setTheme(state.theme);
    setBadgeVisible(state.badgeVisible);
    if (state.locale) setLocale(state.locale);
  };
  return (
    <div className="w-96">
      <PreferencesPanel
        customHeaderNames={names}
        theme={theme}
        locale={locale}
        badgeVisible={badgeVisible}
        onCommand={onCommand}
        incognitoAllowed={incognitoAllowed}
        loadShortcuts={storyShortcuts}
      />
    </div>
  );
}

const baseArgs = {
  customHeaderNames: [],
  theme: 'system',
  locale: 'en',
  badgeVisible: true,
  onCommand: () => {},
  loadShortcuts: storyShortcuts,
} satisfies Partial<React.ComponentProps<typeof PreferencesPanel>>;

export const IncognitoBlocked: Story = {
  args: { ...baseArgs, incognitoAllowed: false },
  render: () => <Interactive incognitoAllowed={false} />,
};

export const IncognitoAllowed: Story = {
  args: { ...baseArgs, incognitoAllowed: true },
  render: () => <Interactive incognitoAllowed={true} />,
};
