import { useState } from 'react';
import type { Command } from '@/core/commands';
import { Button } from '@/ui/Button';
import { useT } from './i18n-context';

export interface PreferencesPanelProps {
  customHeaderNames: readonly string[];
  onCommand: (command: Command) => void;
  /** null = 아직 조회 중. App이 시크릿 미허용 배너를 소유하므로 여기선 허용 시에만 확인 문구. */
  incognitoAllowed: boolean | null;
}

/** 보조 설정 — autocomplete 사용자 항목, 단축키·시크릿 안내. */
export function PreferencesPanel({
  customHeaderNames,
  onCommand,
  incognitoAllowed,
}: PreferencesPanelProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const add = () => {
    if (draft.trim() === '') return;
    onCommand({ type: 'add-custom-header-name', name: draft });
    setDraft('');
  };

  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-zinc-400">{t('preferences')}</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" aria-label="Toggle preferences" onClick={() => setOpen(!open)}>
          {open ? t('hide') : t('show')}
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{t('autocompleteHeaders')}</span>
            <div className="flex gap-1">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') add();
                }}
                placeholder="X-My-Header"
                aria-label="New autocomplete header"
                className="h-7 flex-1 rounded-md border border-zinc-300 bg-white px-2 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <Button size="sm" aria-label="Add autocomplete header" onClick={add} disabled={draft.trim() === ''}>
                {t('add')}
              </Button>
            </div>
            {customHeaderNames.length > 0 && (
              <ul className="flex flex-wrap gap-1">
                {customHeaderNames.map((name) => (
                  <li
                    key={name}
                    className="flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800"
                  >
                    {name}
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      className="text-zinc-400 hover:text-red-500"
                      onClick={() => onCommand({ type: 'remove-custom-header-name', name })}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-zinc-500">
            {t('shortcutsHint')} <code>chrome://extensions/shortcuts</code>.
          </p>

          {incognitoAllowed && <p className="text-zinc-500">{t('incognitoAllowed')}</p>}
        </div>
      )}
    </section>
  );
}
