import type { Modification } from '@/core/schema';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import { useT } from '@/ui/i18n-context';
import { ruleView } from './rule-summary';

export interface RuleRowProps {
  modification: Modification;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}

/**
 * 규칙 읽기 요약 행 (ADR 0006) — 체크박스 + 제목/배지 + 효과 한 줄 + Edit/Delete.
 * 편집은 전부 폼에서 일어난다. 목록은 스캔용이다.
 */
export function RuleRow({ modification, onToggleEnabled, onEdit, onRemove }: RuleRowProps) {
  const t = useT();
  const view = ruleView(modification, t);

  return (
    <div className="flex items-center gap-2.5 py-2">
      <Checkbox
        checked={modification.enabled}
        onChange={(e) => onToggleEnabled(e.target.checked)}
        aria-label={t('ariaEnableModification')}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{view.title}</span>
          <span className="shrink-0 rounded bg-blue-50 px-1 py-px text-[10px] font-medium tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            {view.badge}
          </span>
        </div>
        <div className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {view.summary}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          {t('edit')}
        </Button>
        <Button variant="danger" size="sm" onClick={onRemove}>
          {t('menuDelete')}
        </Button>
      </div>
    </div>
  );
}
