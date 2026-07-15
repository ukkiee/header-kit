import { useState } from 'react';
import type { Command } from '@/core/commands';
import type { Profile, StoredState } from '@/core/schema';
import { exportProfiles, parseImport, serializeExport } from '@/core/transfer';
import { Button } from '@/ui/Button';
import { TextArea } from '@/ui/Input';
import { useT } from './i18n-context';

export interface TransferPanelProps {
  state: StoredState;
  /** 권위 실행 결과를 돌려받아야 한다 — 거부된 Import를 성공처럼 닫지 않기 위해. */
  onCommand: (command: Command) => Promise<{ ok: boolean; error?: string }>;
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
  const t = useT();
  const [mode, setMode] = useState<Mode>('idle');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [importText, setImportText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);

  const enterMode = (nextMode: Mode) => {
    setMode(nextMode);
    setSelected(new Set(state.profiles.map((p) => p.id)));
    setImportText('');
    setErrors([]);
    setNotices([]);
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

  const runImport = async () => {
    const parsed = parseImport(importText);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    const result = await onCommand({ type: 'import-profiles', profiles: parsed.profiles });
    if (!result.ok) {
      // 권위 경로가 거부(예: 플랫폼 미지원 regex) — 패널을 닫지 않고 오류를 보여준다.
      setErrors((result.error ?? 'Import rejected.').split('\n'));
      return;
    }
    setNotices(parsed.notices);
    setMode('idle');
  };

  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-zinc-400">{t('profiles')}</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => enterMode(mode === 'export' ? 'idle' : 'export')}>
          {t('export')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => enterMode(mode === 'import' ? 'idle' : 'import')}>
          {t('import')}
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
              {t('export')} ({selected.size})
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode('idle')}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {mode === 'import' && (
        <div className="flex flex-col gap-1.5">
          <TextArea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={t('pasteExportHere')}
            aria-label="Import JSON"
            rows={5}
            font="mono"
            size="sm"
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
            <Button
              size="sm"
              aria-label="Run import"
              onClick={() => void runImport()}
              disabled={importText.trim() === ''}
            >
              {t('importAction')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode('idle')}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
