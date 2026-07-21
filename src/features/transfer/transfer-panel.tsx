import { useState } from 'react';
import type { Command } from '@/core/commands';
import type { Profile, StoredState } from '@/core/schema';
import { exportProfiles, parseImport, serializeExport } from '@/core/transfer';
import { Alert } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import { TextArea } from '@/ui/input';
import { PanelSection } from '@/ui/panel-section';
import { useT } from '@/ui/i18n-context';

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
    <PanelSection
      title={t('profiles')}
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => enterMode(mode === 'export' ? 'idle' : 'export')}>
            {t('export')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => enterMode(mode === 'import' ? 'idle' : 'import')}>
            {t('import')}
          </Button>
        </>
      }
    >
      {notices.length > 0 && (
        <Alert as="ul" severity="info" size="xs">
          {notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </Alert>
      )}

      {mode === 'export' && (
        <div className="flex flex-col gap-1.5">
          {state.profiles.map((profile) => (
            <label key={profile.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.has(profile.id)}
                onChange={() => toggleSelected(profile)}
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
            aria-label={t('ariaImportJson')}
            rows={5}
            font="mono"
            size="sm"
          />
          <input
            type="file"
            accept="application/json,.json"
            aria-label={t('ariaImportFile')}
            className="text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void file.text().then(setImportText);
            }}
          />
          {errors.length > 0 && (
            <Alert as="ul" severity="danger" size="xs" role="alert">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </Alert>
          )}
          <div className="flex gap-1">
            <Button
              size="sm"
              aria-label={t('ariaRunImport')}
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
    </PanelSection>
  );
}
