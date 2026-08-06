import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { Locale } from '@/core/i18n';
import type { ThemePreference } from '@/core/theme';
import { PreferencesPanel } from './preferences-panel';

const meta = {
  title: 'Popup/PreferencesPanel',
  component: PreferencesPanel,
} satisfies Meta<typeof PreferencesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 세 컨트롤이 **전부 살아 있어야** 한다 — 고정값을 주면 스토리에서 칩과 스위치가 죽어 보이고,
 * 고른 값이 화면에 어떻게 되비치는지가 이 스토리가 보여 줄 수 있는 유일한 것이다.
 */
function Interactive({ initialLocale = 'en' }: { initialLocale?: Locale }) {
  const [theme, setTheme] = useState<ThemePreference>('system');
  const [badgeVisible, setBadgeVisible] = useState(true);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  return (
    <div className="w-96">
      <PreferencesPanel
        theme={theme}
        locale={locale}
        badgeVisible={badgeVisible}
        onCommand={(command) => {
          if (command.type === 'set-theme') setTheme(command.theme);
          if (command.type === 'set-badge-visible') setBadgeVisible(command.visible);
          if (command.type === 'set-locale') setLocale(command.locale);
        }}
      />
    </div>
  );
}

const baseArgs = {
  theme: 'system',
  locale: 'en',
  badgeVisible: true,
  onCommand: () => {},
} satisfies React.ComponentProps<typeof PreferencesPanel>;

export const Default: Story = {
  args: baseArgs,
  render: () => <Interactive />,
};

/** ko에서도 칩 라벨이 각 언어 자신의 이름이라, 지금 화면이 무슨 언어든 알아볼 수 있다. */
export const Korean: Story = {
  args: { ...baseArgs, locale: 'ko' },
  render: () => <Interactive initialLocale="ko" />,
};
