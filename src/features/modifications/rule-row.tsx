import type { ReactNode } from 'react';
import type { Modification } from '@/core/schema';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import { useT } from '@/ui/i18n-context';
import { ruleView } from './rule-summary';

/**
 * 목록 항목의 읽기 요약 행 (ADR 0006/0009) — 규칙과 적용 조건이 같은 시각 언어를
 * 공유한다: 체크박스 + 제목/배지 + 효과 한 줄 + Edit/Delete. 편집은 폼에서.
 */
export interface ItemRowProps {
  title: ReactNode;
  badge: string;
  summary: ReactNode;
  enabled: boolean;
  /** 체크박스 접근성 이름 — 규칙/조건이 각자 정직한 라벨을 준다. */
  toggleAria: string;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}

export function ItemRow({
  title,
  badge,
  summary,
  enabled,
  toggleAria,
  onToggleEnabled,
  onEdit,
  onRemove,
}: ItemRowProps) {
  const t = useT();
  return (
    <div className="flex items-center gap-2.5 py-2">
      <Checkbox
        checked={enabled}
        onChange={(e) => onToggleEnabled(e.target.checked)}
        aria-label={toggleAria}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{title}</span>
          <span className="shrink-0 rounded bg-blue-50 px-1 py-px text-[10px] font-medium tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            {badge}
          </span>
        </div>
        <div className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">{summary}</div>
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

export interface RuleRowProps {
  modification: Modification;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}

export function RuleRow({ modification, onToggleEnabled, onEdit, onRemove }: RuleRowProps) {
  const t = useT();
  const view = ruleView(modification, t);
  return (
    <ItemRow
      title={view.title}
      badge={view.badge}
      summary={view.summary}
      enabled={modification.enabled}
      toggleAria={t('ariaEnableModification')}
      onToggleEnabled={onToggleEnabled}
      onEdit={onEdit}
      onRemove={onRemove}
    />
  );
}
