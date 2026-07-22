import { Clock, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Modification } from '@/core/schema';
import { Checkbox } from '@/ui/checkbox';
import { IconButton } from '@/ui/icon-button';
import { badgePill } from '@/ui/tokens';
import { useT } from '@/ui/i18n-context';
import { ruleView, type ConditionBadge } from './rule-summary';

/** 조건 배지 줄 (ui-refine 05) — 값이 한눈에 보이게. 조건 없으면 렌더 안 함. */
function ConditionBadges({ badges }: { badges: ConditionBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {badges.map((b, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-0.5 ${badgePill} ${
            b.tone === 'exclude'
              ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
          }`}
        >
          {b.icon === 'clock' && <Clock size={9} strokeWidth={2} />}
          {b.label}
        </span>
      ))}
    </div>
  );
}

/**
 * 목록 항목의 읽기 요약 행 (ADR 0006/0009) — 체크박스 + 제목/배지 + 효과 한 줄 +
 * 편집/삭제 아이콘. 아이콘은 행 호버·포커스 시에만 보인다(읽기 모드 최소 소음).
 * 편집은 폼에서.
 */
export interface ItemRowProps {
  title: ReactNode;
  badge: string;
  summary: ReactNode;
  /** 조건 배지 줄 — 없으면 배지 줄 자체가 렌더되지 않아 행 높이가 불변. */
  conditionBadges?: ConditionBadge[];
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
  conditionBadges = [],
  enabled,
  toggleAria,
  onToggleEnabled,
  onEdit,
  onRemove,
}: ItemRowProps) {
  const t = useT();
  return (
    <div className="group flex items-start gap-2.5 py-2">
      <Checkbox
        offset="row"
        checked={enabled}
        onCheckedChange={onToggleEnabled}
        aria-label={toggleAria}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{title}</span>
          <span className={`shrink-0 tracking-wide bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 ${badgePill}`}>
            {badge}
          </span>
        </div>
        <div className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">{summary}</div>
        <ConditionBadges badges={conditionBadges} />
      </div>
      <div className="flex shrink-0 items-center gap-1 self-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <IconButton label={t('edit')} icon={Pencil} onClick={onEdit} />
        <IconButton label={t('menuDelete')} icon={Trash2} tone="danger" onClick={onRemove} />
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
      conditionBadges={view.conditionBadges}
      enabled={modification.enabled}
      toggleAria={t('ariaEnableModification')}
      onToggleEnabled={onToggleEnabled}
      onEdit={onEdit}
      onRemove={onRemove}
    />
  );
}
