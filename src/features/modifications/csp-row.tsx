import type { CspModification, Modification } from '@/core/schema';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import { Input } from '@/ui/input';
import { KindLabel } from '@/ui/kind-label';
import { ModRowShell, modSummary, type RowExpansionProps } from '@/ui/mod-table';
import { useT } from '@/ui/i18n-context';

export interface CspRowProps extends RowExpansionProps {
  modification: CspModification;
  onChange: (next: Modification) => void;
  onRemove: () => void;
}

/**
 * CSP 테이블 행 — 1줄 요약(디렉티브 나열), 선택 시 디렉티브 편집기가 확장된다.
 * 합성해 Content-Security-Policy 응답 헤더로 set 된다.
 */
export function CspRow({ modification, onChange, onRemove, expanded, onToggleExpanded }: CspRowProps) {
  const t = useT();
  const setDirectives = (directives: CspModification['directives']) =>
    onChange({ ...modification, directives });

  const summary =
    modification.directives
      .map((d) => `${d.name} ${d.value}`.trim())
      .filter(Boolean)
      .join(' · ') || 'Content-Security-Policy';

  return (
    <ModRowShell
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      cells={
        <>
          <Checkbox
            checked={modification.enabled}
            onChange={(e) => onChange({ ...modification, enabled: e.target.checked })}
            aria-label="Enable modification"
          />
          <KindLabel width="auto">CSP</KindLabel>
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
      {modification.directives.map((directive, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            size="sm"
            value={directive.name}
            onChange={(e) =>
              setDirectives(
                modification.directives.map((d, j) => (j === i ? { ...d, name: e.target.value } : d)),
              )
            }
            placeholder="default-src"
            aria-label="CSP directive name"
            className="w-32"
          />
          <Input
            size="sm"
            font="mono"
            value={directive.value}
            onChange={(e) =>
              setDirectives(
                modification.directives.map((d, j) => (j === i ? { ...d, value: e.target.value } : d)),
              )
            }
            placeholder="'self'"
            aria-label="CSP directive value"
            className="min-w-0 flex-1"
          />
          <Button
            variant="danger"
            size="sm"
            aria-label="Remove directive"
            onClick={() => setDirectives(modification.directives.filter((_, j) => j !== i))}
          >
            ✕
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDirectives([...modification.directives, { name: '', value: '' }])}
        >
          + {t('addDirective')}
        </Button>
        <Button variant="danger" size="sm" onClick={onRemove} aria-label="Remove modification">
          ✕
        </Button>
      </div>
    </ModRowShell>
  );
}
