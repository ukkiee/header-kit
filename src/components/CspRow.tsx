import type { CspModification, Modification } from '@/core/schema';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { Input } from '@/ui/Input';
import { KindLabel } from '@/ui/KindLabel';
import { useT } from './i18n-context';

export interface CspRowProps {
  modification: CspModification;
  onChange: (next: Modification) => void;
  onRemove: () => void;
}

/** CSP 디렉티브 단위 편집기 — 합성해 Content-Security-Policy 응답 헤더로 set 된다. */
export function CspRow({ modification, onChange, onRemove }: CspRowProps) {
  const t = useT();
  const setDirectives = (directives: CspModification['directives']) =>
    onChange({ ...modification, directives });

  return (
    <Card variant="row">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={modification.enabled}
          onChange={(e) => onChange({ ...modification, enabled: e.target.checked })}
          aria-label="Enable modification"
        />
        <KindLabel>CSP</KindLabel>
        <span className="flex-1 text-xs text-zinc-500">Content-Security-Policy</span>
        <Button variant="danger" size="sm" onClick={onRemove} aria-label="Remove modification">
          ✕
        </Button>
      </div>

      <div className="flex flex-col gap-1 pl-6">
        {modification.directives.map((directive, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input
              size="sm"
              value={directive.name}
              onChange={(e) =>
                setDirectives(
                  modification.directives.map((d, j) =>
                    j === i ? { ...d, name: e.target.value } : d,
                  ),
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
                  modification.directives.map((d, j) =>
                    j === i ? { ...d, value: e.target.value } : d,
                  ),
                )
              }
              placeholder="'self'"
              aria-label="CSP directive value"
              className="flex-1"
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
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setDirectives([...modification.directives, { name: '', value: '' }])}
        >
          + {t('addDirective')}
        </Button>
      </div>
    </Card>
  );
}
