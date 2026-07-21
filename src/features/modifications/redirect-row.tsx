import type { Modification, RedirectModification } from '@/core/schema';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Checkbox } from '@/ui/checkbox';
import { Input } from '@/ui/input';
import { KindLabel } from '@/ui/kind-label';
import { NoteText } from '@/ui/note-text';
import { useT } from '@/ui/i18n-context';

export interface RedirectRowProps {
  modification: RedirectModification;
  onChange: (next: Modification) => void;
  onRemove: () => void;
}

/** Redirect — regex 매칭 + 캡처 그룹 치환(\1~\9)으로 URL을 재작성한다. */
export function RedirectRow({ modification, onChange, onRemove }: RedirectRowProps) {
  const t = useT();
  return (
    <Card variant="row">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={modification.enabled}
          onChange={(e) => onChange({ ...modification, enabled: e.target.checked })}
          aria-label="Enable modification"
        />
        <KindLabel>{t('modRedirect')}</KindLabel>
        <Input
          font="mono"
          value={modification.pattern}
          onChange={(e) => onChange({ ...modification, pattern: e.target.value })}
          placeholder="^https://prod\\.example\\.com/(.*)"
          aria-label="Redirect pattern"
          className="min-w-0 flex-1"
        />
        <span className="text-xs text-zinc-400">→</span>
        <Input
          font="mono"
          value={modification.substitution}
          onChange={(e) => onChange({ ...modification, substitution: e.target.value })}
          placeholder="http://localhost:3000/\\1"
          aria-label="Redirect substitution"
          className="min-w-0 flex-1"
        />
        <Button variant="danger" size="sm" onClick={onRemove} aria-label="Remove modification">
          ✕
        </Button>
      </div>
      <NoteText indent="row">{t('redirectCaptureNote')}</NoteText>
    </Card>
  );
}
