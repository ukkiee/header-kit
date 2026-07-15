import { useState } from 'react';
import type { Command } from '@/core/commands';
import { t, type Locale } from '@/core/i18n';
import { Button } from './Button';

export interface PreferencesPanelProps {
  customHeaderNames: readonly string[];
  onCommand: (command: Command) => void;
  incognitoAllowed: boolean | null;
  locale: Locale;
}

/** 보조 설정 — autocomplete 사용자 항목, 단축키·시크릿 안내. */
export function PreferencesPanel({
  customHeaderNames,
  onCommand,
  incognitoAllowed,
  locale,
}: PreferencesPanelProps) {
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
        <span className="text-xs font-medium text-zinc-400">Preferences</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" aria-label="Toggle preferences" onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Show'}
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex flex-col gap-1">
            <span className="font-medium">Autocomplete header names</span>
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
              <Button size="sm" onClick={add} disabled={draft.trim() === ''}>
                Add
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
            Keyboard shortcuts (Alt+Shift+H / Alt+Shift+P) can be changed at{' '}
            <code>chrome://extensions/shortcuts</code>.
          </p>

          <p className="text-zinc-500">
            {incognitoAllowed
              ? t(locale, 'incognitoAllowed')
              : t(locale, 'incognitoBlocked')}
          </p>
        </div>
      )}
    </section>
  );
}
