import { useState } from 'react';
import type { Command } from '@/core/commands';
import type { Profile, StoredState } from '@/core/schema';
import { exportProfiles, parseImport, serializeExport } from '@/core/transfer';
import { Button } from './Button';

export interface TransferPanelProps {
  state: StoredState;
  onCommand: (command: Command) => void;
  /** 테스트·Storybook에서 다운로드를 가로채기 위한 주입 지점. */
  download?: (filename: string, text: string) => void;
}

function browserDownload(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type Mode = 'idle' | 'export' | 'import';

export function TransferPanel({ state, onCommand, download = browserDownload }: TransferPanelProps) {
  const [mode, setMode] = useState<Mode>('idle');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [importText, setImportText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);

  const reset = (nextMode: Mode) => {
    setMode(nextMode);
    setSelected(new Set(state.profiles.map((p) => p.id)));
    setImportText('');
    setErrors([]);
  };

  const toggleSelected = (profile: Profile) => {
    const next = new Set(selected);
    if (next.has(profile.id)) next.delete(profile.id);
    else next.add(profile.id);
    setSelected(next);
  };

  const runExport = () => {
    const text = serializeExport(exportProfiles(state, [...selected]));
    download('headerkit-profiles.json', text);
    setMode('idle');
  };

  const runImport = () => {
    const result = parseImport(importText);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onCommand({ type: 'import-profiles', profiles: result.profiles });
    setNotices(result.notices);
    setMode('idle');
  };

  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-zinc-400">Profiles</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => reset(mode === 'export' ? 'idle' : 'export')}>
          Export…
        </Button>
        <Button variant="ghost" size="sm" onClick={() => reset(mode === 'import' ? 'idle' : 'import')}>
          Import…
        </Button>
      </div>

      {notices.length > 0 && (
        <ul className="rounded-md bg-blue-50 px-2 py-1 text-[11px] text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          {notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      )}

      {mode === 'export' && (
        <div className="flex flex-col gap-1.5">
          {state.profiles.map((profile) => (
            <label key={profile.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(profile.id)}
                onChange={() => toggleSelected(profile)}
                className="size-4 accent-blue-600"
              />
              {profile.name}
            </label>
          ))}
          <div className="flex gap-1">
            <Button size="sm" onClick={runExport} disabled={selected.size === 0}>
              Export {selected.size} profile{selected.size === 1 ? '' : 's'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'import' && (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste a HeaderKit export here…"
            aria-label="Import JSON"
            rows={5}
            className="rounded-md border border-zinc-300 bg-white p-2 font-mono text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Import file"
            className="text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void file.text().then(setImportText);
            }}
          />
          {errors.length > 0 && (
            <ul
              role="alert"
              className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950 dark:text-red-300"
            >
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-1">
            <Button size="sm" onClick={runImport} disabled={importText.trim() === ''}>
              Import
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
