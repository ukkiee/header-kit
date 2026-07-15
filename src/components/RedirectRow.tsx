import type { Modification, RedirectModification } from '@/core/schema';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { useT } from './i18n-context';

export interface RedirectRowProps {
  modification: RedirectModification;
  onChange: (next: Modification) => void;
  onRemove: () => void;
}

/** Redirect — regex 매칭 + 캡처 그룹 치환(\1~\9)으로 URL을 재작성한다. */
export function RedirectRow({ modification, onChange, onRemove }: RedirectRowProps) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1 rounded-md border border-transparent px-1 py-1 hover:border-zinc-200 dark:hover:border-zinc-800">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={modification.enabled}
          onChange={(e) => onChange({ ...modification, enabled: e.target.checked })}
          aria-label="Enable modification"
          className="size-4 accent-blue-600"
        />
        <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          Redirect
        </span>
        <Input
          font="mono"
          value={modification.pattern}
          onChange={(e) => onChange({ ...modification, pattern: e.target.value })}
          placeholder="^https://prod\\.example\\.com/(.*)"
          aria-label="Redirect pattern"
          className="flex-1"
        />
        <span className="text-xs text-zinc-400">→</span>
        <Input
          font="mono"
          value={modification.substitution}
          onChange={(e) => onChange({ ...modification, substitution: e.target.value })}
          placeholder="http://localhost:3000/\\1"
          aria-label="Redirect substitution"
          className="flex-1"
        />
        <Button variant="danger" size="sm" onClick={onRemove} aria-label="Remove modification">
          ✕
        </Button>
      </div>
      <p className="pl-6 text-[10px] text-zinc-400">{t('redirectCaptureNote')}</p>
    </div>
  );
}
