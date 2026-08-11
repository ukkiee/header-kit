import { useState } from 'react';
import type { Command } from '@/core/commands';
import { format } from '@/core/i18n';
import type { Profile, StoredState } from '@/core/schema';
import { exportProfiles, parseImport, serializeExport } from '@/core/transfer';
import { importIssueText } from './import-text';
import { AlertBanner } from '@/ui/alert-banner';
import { Button } from '@/ui/press-button';
import { Checkbox } from '@/ui/checkbox';
import { AnimatePresence, MotionRow } from '@/ui/motion-row';
import { SectionCard } from '@/ui/section-card';
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
  /** 고른 파일 이름 — 무엇을 들여올 참인지 보여 준다(내용은 화면에 펴지 않는다). */
  const [fileName, setFileName] = useState<string | null>(null);
  /** 지금 파일이 이 영역 위에 떠 있는가 — 놓을 자리라는 것을 면으로 말한다. */
  const [dropping, setDropping] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);

  const enterMode = (nextMode: Mode) => {
    setMode(nextMode);
    setSelected(new Set(state.profiles.map((p) => p.id)));
    setImportText('');
    setFileName(null);
    setDropping(false);
    setErrors([]);
    setNotices([]);
  };

  /**
   * 고른(또는 놓은) 파일 하나를 읽는다 — 놓기와 파일 선택이 같은 문을 지난다.
   *
   * 읽기 실패를 삼키지 않는다: 폴더를 놓거나 권한이 없으면 `text()`가 던지는데, 조용히
   * 넘기면 "가져오기" 버튼이 죽은 채 이유가 없는 화면이 된다.
   */
  const readFile = (file: File | undefined | null) => {
    if (!file) return;
    setErrors([]);
    setFileName(file.name);
    void file.text().then(setImportText, (reason: unknown) => {
      setImportText('');
      setErrors([reason instanceof Error ? reason.message : String(reason)]);
    });
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
      // core는 코드로 말한다 — 사용자의 말로 옮기는 것은 로케일을 아는 이쪽이다.
      setErrors(parsed.errors.map((e) => importIssueText(e, t)));
      return;
    }
    const result = await onCommand({ type: 'import-profiles', profiles: parsed.profiles });
    if (!result.ok) {
      // 권위 경로가 거부(예: 플랫폼 미지원 regex) — 패널을 닫지 않고 오류를 보여준다.
      setErrors((result.error ?? 'Import rejected.').split('\n'));
      return;
    }
    setNotices(parsed.notices.map((n) => importIssueText(n, t)));
    setMode('idle');
  };

  /*
   * 백업 화면의 **첫 카드** (티켓 09, 스펙 story 73) — 내보내기와 가져오기가 한 자리에 있다.
   * 둘 다 "프로필 전체를 파일로 두고 되찾는" 같은 일이라, 갈라 두면 백업하러 온 사람이 반쪽만
   * 찾는다. 나머지 셋(동기화·히스토리·초기화)은 `BackupPanel`이 같은 `Card` 셸로 그린다.
   */
  return (
    <SectionCard
      title={t('transferJson')}
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
        <AlertBanner as="ul" severity="info" size="xs">
          {notices.map((notice, index) => (
            <li key={`${index}-${notice}`}>{notice}</li>
          ))}
        </AlertBanner>
      )}

      {/*
        내보내기·가져오기 본문은 **접혔다 펴진다** (ADR 0012의 목록 모션과 같은 것).
        버튼 하나에 카드 절반이 통째로 나타나면 아래 카드 셋이 한 프레임에 밀려나, 무엇이
        열렸는지보다 화면이 튀었다는 것이 먼저 읽힌다.

        `mode`를 key로 준 하나의 `AnimatePresence`라 **내보내기 ↔ 가져오기 전환도** 접힘과
        펴짐으로 이어진다 — 두 본문을 따로 감싸면 그 전환에서 둘이 동시에 서서 카드가 한 번
        커졌다 줄어든다. `initial={false}`는 백업 화면을 처음 열 때(둘 다 닫힘) 아무것도
        움직이지 않게 한다.
      */}
      <AnimatePresence initial={false} mode="wait">
        {mode === 'export' && (
          <MotionRow key="export">
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
                {/* 실행 버튼은 말줄임표를 떼고 고른 수를 붙인다 — '내보내기… (2)'는 더 물어볼
                것이 있다는 뜻으로 읽히는데, 누르면 곧바로 파일이 떨어진다. */}
                <Button size="sm" onClick={runExport} disabled={selected.size === 0}>
                  {t('exportAction')} ({selected.size})
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMode('idle')}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          </MotionRow>
        )}

        {mode === 'import' && (
          <MotionRow key="import">
            <div className="flex flex-col gap-1.5">
              {/*
            **파일 하나만 받는다** — 붙여넣기 칸을 걷었다.
            내보내기가 파일을 주므로 되돌아오는 것도 파일이다. 붙여넣기 칸은 그 왕복에
            없는 세 번째 길이었고, 폭 좁은 팝업에서 다섯 줄을 먹으면서 실제로는 JSON을
            손으로 편집하게 부추겼다 — 거기서 깨진 것은 파서가 잡지만 사용자는 왜 깨졌는지
            모른다. 놓기와 고르기 둘 다 같은 자리를 쓴다: 라벨이 숨은 파일 입력을 감싸므로
            클릭은 파일 선택창을 열고, 같은 영역에 떨어뜨리면 그 파일을 읽는다.
          */}
              <label
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-5 text-center text-xs transition-colors ${
                  dropping
                    ? 'border-primary bg-secondary text-foreground'
                    : 'border-input text-muted-foreground'
                }`}
                onDragOver={(e) => {
                  // 기본 동작은 브라우저가 그 파일로 **이동**하는 것이다 — 막지 않으면 확장 화면이
                  // JSON 뷰어로 바뀐다.
                  e.preventDefault();
                  setDropping(true);
                }}
                onDragLeave={() => setDropping(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropping(false);
                  readFile(e.dataTransfer.files?.[0]);
                }}
              >
                <span>{t('dropExportHere')}</span>
                {fileName !== null && (
                  <span className="font-mono text-[11px] text-foreground">
                    {format(t('importFileChosen'), { name: fileName })}
                  </span>
                )}
                <input
                  type="file"
                  accept="application/json,.json"
                  aria-label={t('ariaImportFile')}
                  className="sr-only"
                  onChange={(e) => readFile(e.target.files?.[0])}
                />
              </label>
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
          </MotionRow>
        )}
      </AnimatePresence>
    </SectionCard>
  );
}
