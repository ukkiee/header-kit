import { useState } from 'react';
import { X } from 'lucide-react';
import { STANDARD_HEADERS } from '@/core/autocomplete';
import type { Command } from '@/core/commands';
import type { MessageKey } from '@/core/i18n';
import { THEME_PREFERENCES, type ThemePreference } from '@/core/theme';
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

export interface PreferencesPanelProps {
  customHeaderNames: readonly string[];
  /** 현재 명암 선호 — 해석은 셸이 하고, 이 패널은 고르는 자리만 제공한다. */
  theme: ThemePreference;
  /** 툴바 배지를 보일지 — 표시 여부만 정한다. 꺼도 규칙은 그대로 걸린다. */
  badgeVisible: boolean;
  onCommand: (command: Command) => void;
  /** null = 아직 조회 중. App이 시크릿 미허용 배너를 소유하므로 여기선 허용 시에만 확인 문구. */
  incognitoAllowed: boolean | null;
}

/** 보조 설정 — autocomplete 사전(기본+사용자 항목), 시크릿 안내. */
export function PreferencesPanel({
  customHeaderNames,
  theme,
  badgeVisible,
  onCommand,
  incognitoAllowed,
}: PreferencesPanelProps) {
  const t = useT();
  // 처음부터 펼쳐 둔다 — 이 화면은 환경설정 하나를 보러 들어오는 곳이라, 닫힌 채로
  // 두면 도착하자마자 한 번 더 눌러야 했다.
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');

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
              <span className="text-zinc-500">{t('badgeCountNote')}</span>
            </div>
            <ToggleSwitch
              checked={badgeVisible}
              onCheckedChange={(visible) => onCommand({ type: 'set-badge-visible', visible })}
              aria-label={t('badgeCount')}
            />
          </div>

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
                    className="text-zinc-400 hover:text-red-500"
                    onClick={() => onCommand({ type: 'remove-custom-header-name', name })}
                  >
                    <X size={12} strokeWidth={1.75} />
                  </button>
                </Pill>
              ))}
            </ul>
          </div>

          {incognitoAllowed && <p className="text-zinc-500">{t('incognitoAllowed')}</p>}
        </div>
    </CollapsiblePanel>
  );
}
