import type { Command } from '@/core/commands';
import { LOCALES, type Locale, type MessageKey } from '@/core/i18n';
import { THEME_PREFERENCES, type ThemePreference } from '@/core/theme';
import { ChoiceChips } from '@/ui/chip-group';
import { Card, CardContent } from '@/ui/card';
import { ToggleSwitch } from '@/ui/toggle-switch';
import { useT } from '@/ui/i18n-context';

/** 선호값 → 라벨 키. Record로 못박아 값이 늘면 여기서 타입이 먼저 깨지게 한다. */
const THEME_LABELS: Record<ThemePreference, MessageKey> = {
  system: 'themeSystem',
  dark: 'themeDark',
  light: 'themeLight',
};

/** 로케일 → 라벨 키. THEME_LABELS와 같은 이유로 Record — 로케일이 늘면 여기서 먼저 깨진다. */
const LOCALE_LABELS: Record<Locale, MessageKey> = {
  en: 'languageEn',
  ko: 'languageKo',
};

export interface PreferencesPanelProps {
  /** 현재 명암 선호 — 해석은 셸이 하고, 이 패널은 고르는 자리만 제공한다. */
  theme: ThemePreference;
  /**
   * 지금 화면이 쓰는 언어 — 저장된 선호가 없으면 브라우저 UI 언어에서 온 값이다.
   * 고르는 칩은 **보이는 언어**를 짚어야 한다: 저장값만 보면 아직 고른 적 없는 사용자에게
   * 아무 칩도 눌리지 않은 목록이 보이고, 그건 지금 무슨 언어인지 말해 주지 않는다.
   */
  locale: Locale;
  /** 툴바 배지를 보일지 — 표시 여부만 정한다. 꺼도 규칙은 그대로 걸린다. */
  badgeVisible: boolean;
  onCommand: (command: Command) => void;
}

/**
 * 설정 — **셋뿐이다**: 테마 · 배지 표시 · 언어 (ADR 0017, 티켓 09, 스펙 story 78–80).
 *
 * 예전에는 여기에 단축키 목록·자동완성 헤더 사전 관리·시크릿 확인 문구가 함께 있었다. 시안에
 * 셋 다 없으므로 걷었다. 각각의 사정이 다르다:
 *
 * - **단축키 목록**은 스펙이 명시적으로 범위 밖에 뒀다("시안에 목록이 있지만 넣지 않는다").
 *   이미 등록된 커맨드는 그대로 동작한다 — 없어진 것은 그것을 **옮겨 적던 화면**뿐이다.
 * - **자동완성 헤더 사전**은 손으로 등록·삭제하던 자리였다. 그 일을 이제 규칙 저장이 대신
 *   한다(`withRememberedValues`) — 쿠키 이름·User-Agent가 이미 그랬던 것과 같은 경로다.
 * - **시크릿 확인 문구**는 허용됐을 때만 뜨던 한 줄이다. 알려야 하는 쪽(허용되지 **않은**
 *   경우)은 셸이 배너로 들고 있으므로, 이 한 줄이 없어도 사용자가 놓치는 사실이 없다.
 *
 * 카드 하나에 세 묶음이다. 시안의 설정 화면이 그렇고, 셋 다 "한 번 정하고 잊는" 값이라
 * 서로를 밀어낼 만큼 길지 않다.
 */
export function PreferencesPanel({
  theme,
  locale,
  badgeVisible,
  onCommand,
}: PreferencesPanelProps) {
  const t = useT();

  return (
    <Card className="gap-3 text-xs">
      <CardContent className="flex flex-col gap-3">
        {/* 테마 (ADR 0015) — '시스템'을 맨 앞에 둔다. 기본값이고, 대부분의 사용자가
            머무는 자리라 목록의 첫 칸이 맞다. */}
        <div className="flex flex-col gap-1">
          <span className="font-medium">{t('theme')}</span>
          <ChoiceChips
            value={theme}
            aria-label={t('theme')}
            onValueChange={(next) => onCommand({ type: 'set-theme', theme: next })}
            options={THEME_PREFERENCES.map((value) => ({
              value,
              label: t(THEME_LABELS[value]),
            }))}
          />
        </div>

        {/* 배지 표시 (티켓 06) — 라벨이 배지가 세는 것과 같은 말이어야 한다.
            끄는 것은 표시뿐이라, 규칙이 멈춘 것으로 읽히지 않게 설명을 붙인다. */}
        <div className="flex items-start justify-between gap-2 border-t border-border pt-3">
          <div className="flex flex-col">
            <span className="font-medium">{t('badgeCount')}</span>
            <span className="text-muted-foreground">{t('badgeCountNote')}</span>
          </div>
          <ToggleSwitch
            checked={badgeVisible}
            onCheckedChange={(visible) => onCommand({ type: 'set-badge-visible', visible })}
            aria-label={t('badgeCount')}
          />
        </div>

        {/* 언어 (티켓 09) — 선택지는 ko/en 둘뿐이다. 번역이 없는 언어를 고르게 하면
            카탈로그에 없는 문자열이 화면에 빈칸으로 나타난다(스펙 Out of Scope: ja).
            칩 라벨은 두 로케일에서 각 언어 자신의 이름이라, 지금 화면이 무슨 언어든
            고르려는 언어를 알아볼 수 있다. */}
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <span className="font-medium">{t('language')}</span>
          <ChoiceChips
            value={locale}
            aria-label={t('language')}
            onValueChange={(next) => onCommand({ type: 'set-locale', locale: next })}
            options={LOCALES.map((value) => ({ value, label: t(LOCALE_LABELS[value]) }))}
          />
        </div>
      </CardContent>
    </Card>
  );
}
