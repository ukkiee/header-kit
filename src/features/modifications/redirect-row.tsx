import type { Modification, RedirectModification } from '@/core/schema';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import { Input } from '@/ui/input';
import { KindLabel } from '@/ui/kind-label';
import { ModRowShell, modSummary, type RowExpansionProps } from '@/ui/mod-table';
import { NoteText } from '@/ui/note-text';
import { useT } from '@/ui/i18n-context';

export interface RedirectRowProps extends RowExpansionProps {
  modification: RedirectModification;
  onChange: (next: Modification) => void;
  onRemove: () => void;
}

/**
 * Redirect 테이블 행 — 1줄 요약(패턴 → 치환), 선택 시 편집기가 확장된다.
 * regex 매칭 + 캡처 그룹 치환(\1~\9)으로 URL을 재작성한다.
 */
export function RedirectRow({
  modification,
  onChange,
  onRemove,
  expanded,
  onToggleExpanded,
}: RedirectRowProps) {
  const t = useT();
  const summary = `${modification.pattern || '^…'} → ${modification.substitution || '…'}`;

  return (
    <ModRowShell
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      cells={
        <>
          <Checkbox
            checked={modification.enabled}
            onChange={(e) => onChange({ ...modification, enabled: e.target.checked })}
            aria-label={t('ariaEnableModification')}
          />
          <KindLabel width="auto">{t('modRedirect')}</KindLabel>
          {/* 읽기 전용 요약은 행 선택 표면 — 클릭하면 확장한다. */}
          <span
            className={`${modSummary} ${onToggleExpanded ? 'cursor-pointer' : ''}`}
            onClick={onToggleExpanded}
          >
            {summary}
          </span>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <Input
          size="sm"
          font="mono"
          value={modification.pattern}
          onChange={(e) => onChange({ ...modification, pattern: e.target.value })}
          placeholder="^https://prod\\.example\\.com/(.*)"
          aria-label={t('ariaRedirectPattern')}
          className="min-w-0 flex-1"
        />
        <span className="text-xs text-zinc-400">→</span>
        <Input
          size="sm"
          font="mono"
          value={modification.substitution}
          onChange={(e) => onChange({ ...modification, substitution: e.target.value })}
          placeholder="http://localhost:3000/\\1"
          aria-label={t('ariaRedirectSubstitution')}
          className="min-w-0 flex-1"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <NoteText>{t('redirectCaptureNote')}</NoteText>
        <Button variant="danger" size="sm" onClick={onRemove} aria-label={t('ariaRemoveModification')}>
          ✕
        </Button>
      </div>
    </ModRowShell>
  );
}
