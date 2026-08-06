import { useState } from 'react';
import type { Command } from '@/core/commands';
import type { Profile, StoredState } from '@/core/schema';
import { exportProfiles, parseImport, serializeExport } from '@/core/transfer';
import { AlertBanner } from '@/ui/alert-banner';
import { Button } from '@/ui/press-button';
import { Checkbox } from '@/ui/checkbox';
import { TextArea } from '@/ui/text-field';
import { Card, CardAction, CardHeader, CardContent, CardTitle } from '@/ui/card';
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

  /*
   * 백업 화면의 **첫 카드** (티켓 09, 스펙 story 73) — 내보내기와 가져오기가 한 자리에 있다.
   * 둘 다 "프로필 전체를 파일로 두고 되찾는" 같은 일이라, 갈라 두면 백업하러 온 사람이 반쪽만
   * 찾는다. 나머지 셋(동기화·히스토리·초기화)은 `BackupPanel`이 같은 `Card` 셸로 그린다.
   */
  return (
    <Card size="sm" className="gap-2 text-xs">
      <CardHeader>
        <CardTitle>{t('transferJson')}</CardTitle>
        <CardAction className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => enterMode(mode === 'export' ? 'idle' : 'export')}>
            {t('export')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => enterMode(mode === 'import' ? 'idle' : 'import')}>
            {t('import')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
      {notices.length > 0 && (
        <AlertBanner as="ul" severity="info" size="xs">
          {notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </AlertBanner>
      )}

      {mode === 'export' && (
        <div className="flex flex-col gap-1.5">
          {state.profiles.map((profile) => (
            <label key={profile.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.has(profile.id)}
                onCheckedChange={() => toggleSelected(profile)}
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
            <AlertBanner as="ul" severity="danger" size="xs" role="alert">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </AlertBanner>
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
      </CardContent>
    </Card>
  );
}
