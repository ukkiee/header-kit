import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { STANDARD_HEADERS } from '@/core/autocomplete';
import type { Command } from '@/core/commands';
import { LOCALES, type Locale, type MessageKey } from '@/core/i18n';
import { describeShortcuts, type RegisteredCommand, type ShortcutRow } from '@/core/shortcuts';
import { listShortcuts } from '@/platform/shortcuts';
import { THEME_PREFERENCES, type ThemePreference } from '@/core/theme';
import { AlertBanner } from '@/ui/alert-banner';
import { ChoiceChips } from '@/ui/chip-group';
import { Button } from '@/ui/press-button';
import { Input } from '@/ui/text-field';
import { CollapsiblePanel } from '@/ui/collapsible-panel';
import { Pill } from '@/ui/pill';
import { ToggleSwitch } from '@/ui/toggle-switch';
import { format } from '@/core/i18n';
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
  customHeaderNames: readonly string[];
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
  /** null = 아직 조회 중. App이 시크릿 미허용 배너를 소유하므로 여기선 허용 시에만 확인 문구. */
  incognitoAllowed: boolean | null;
  /** 등록된 커맨드 조회 — 테스트·Storybook 주입 지점(BackupPanel의 loadSnapshots와 같은 결). */
  loadShortcuts?: () => Promise<RegisteredCommand[]>;
}

/** 보조 설정 — autocomplete 사전(기본+사용자 항목), 시크릿 안내. */
export function PreferencesPanel({
  customHeaderNames,
  theme,
  locale,
  badgeVisible,
  onCommand,
  incognitoAllowed,
  loadShortcuts = listShortcuts,
}: PreferencesPanelProps) {
  const t = useT();
  // 처음부터 펼쳐 둔다 — 이 화면은 환경설정 하나를 보러 들어오는 곳이라, 닫힌 채로
  // 두면 도착하자마자 한 번 더 눌러야 했다.
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');
  const [shortcuts, setShortcuts] = useState<ShortcutRow[]>([]);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  // 등록된 커맨드는 열려 있을 때만 읽는다 — 닫힌 패널을 위해 브라우저에 물을 이유가 없다.
  // 거부는 BackupPanel의 loadSnapshots와 같은 결로 배너에 올린다: 목록은 비었을 때
  // 통째로 사라지는 자리라, 삼키면 "단축키가 없다"와 "읽지 못했다"가 같은 화면이 된다.
  useEffect(() => {
    if (open)
      void loadShortcuts().then(
        (commands) => {
          setShortcuts(describeShortcuts(commands));
          setShortcutError(null);
        },
        (reason) => setShortcutError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, [open, loadShortcuts]);

  const add = () => {
    if (draft.trim() === '') return;
    onCommand({ type: 'add-custom-header-name', name: draft });
    setDraft('');
  };

  return (
    <CollapsiblePanel
      title={t('preferences')}
      open={open}
      onOpenChange={setOpen}
      toggleAriaLabel={t('ariaTogglePreferences')}
    >
      <div className="flex flex-col gap-2 text-xs">
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
          <div className="flex items-start justify-between gap-2">
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
          <div className="flex flex-col gap-1">
            <span className="font-medium">{t('language')}</span>
            <ChoiceChips
              value={locale}
              aria-label={t('language')}
              onValueChange={(next) => onCommand({ type: 'set-locale', locale: next })}
              options={LOCALES.map((value) => ({ value, label: t(LOCALE_LABELS[value]) }))}
            />
          </div>

          {/* 단축키 (티켓 09) — **읽기 전용**이다. 새 바인딩을 만들지 않고, 브라우저가 지금
              등록해 둔 것만 옮겨 적는다. 값이 비어 있어도 행을 지우지 않는다 — 커맨드가
              있는데 키가 없다는 사실 자체가 사용자가 알아야 할 정보다. */}
          {shortcutError !== null && (
            <div className="flex flex-col gap-1">
              <span className="font-medium">{t('shortcuts')}</span>
              <AlertBanner as="p" severity="danger" size="xs" role="alert">
                {shortcutError}
              </AlertBanner>
            </div>
          )}
          {shortcuts.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="font-medium">{t('shortcuts')}</span>
              <ul className="flex flex-col gap-0.5">
                {shortcuts.map((row) => (
                  <li key={row.name} className="flex items-center justify-between gap-2">
                    <span>{row.labelKey ? t(row.labelKey) : row.name}</span>
                    <Pill tone="neutral">{row.shortcut ?? t('shortcutUnset')}</Pill>
                  </li>
                ))}
              </ul>
              <span className="text-muted-foreground">{t('shortcutsReadOnly')}</span>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span className="font-medium">{t('autocompleteHeaders')}</span>
            <div className="flex gap-1">
              <Input
                size="sm"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') add();
                }}
                placeholder="X-My-Header"
                aria-label={t('ariaNewAutocompleteHeader')}
                className="min-w-0 flex-1"
              />
              <Button size="sm" aria-label={t('ariaAddAutocompleteHeader')} onClick={add} disabled={draft.trim() === ''}>
                {t('add')}
              </Button>
            </div>
            {/* 기본 사전은 항상 보이고 제거 불가 — 사용자 항목만 X (ui-refine #14). */}
            <ul className="flex flex-wrap gap-1">
              {STANDARD_HEADERS.map((name) => (
                <Pill as="li" key={name} tone="neutral">
                  {name}
                </Pill>
              ))}
              {customHeaderNames.map((name) => (
                <Pill as="li" key={name} tone="neutral">
                  {name}
                  <button
                    type="button"
                    aria-label={format(t('ariaRemoveName'), { name })}
                    className="text-muted-foreground hover:text-red-500"
                    onClick={() => onCommand({ type: 'remove-custom-header-name', name })}
                  >
                    <X size={12} strokeWidth={1.75} />
                  </button>
                </Pill>
              ))}
            </ul>
          </div>

          {incognitoAllowed && <p className="text-muted-foreground">{t('incognitoAllowed')}</p>}
        </div>
    </CollapsiblePanel>
  );
}
