import { hasPlaceholders } from '@/core/placeholder';
import type { RequestHeaderModification } from '@/core/schema';
import { Button } from './Button';

export interface HeaderRowProps {
  modification: RequestHeaderModification;
  onChange: (next: RequestHeaderModification) => void;
  onRemove: () => void;
  /** Placeholder가 실체화된 현재 값 — 활성 Profile에서만 존재한다. */
  materializedValue?: string;
}

export function HeaderRow({
  modification,
  onChange,
  onRemove,
  materializedValue,
}: HeaderRowProps) {
  const withPlaceholders = hasPlaceholders(modification.value);
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={modification.enabled}
        onChange={(e) => onChange({ ...modification, enabled: e.target.checked })}
        aria-label="Enable modification"
        className="size-4 accent-blue-600"
      />
      <input
        type="text"
        value={modification.name}
        onChange={(e) => onChange({ ...modification, name: e.target.value })}
        placeholder="Header name"
        className="h-8 w-36 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        type="text"
        value={modification.value}
        onChange={(e) => onChange({ ...modification, value: e.target.value })}
        placeholder="Value"
        className="h-8 flex-1 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
        <Button variant="danger" size="sm" onClick={onRemove} aria-label="Remove modification">
          ✕
        </Button>
      </div>
      {withPlaceholders && (
        <p className="pl-6 text-[10px] text-zinc-400">
          New value each time the profile activates — constant while it stays on, never
          re-evaluated per request.
          {materializedValue !== undefined && (
            <span className="ml-1 font-mono text-zinc-500">→ {materializedValue}</span>
          )}
        </p>
      )}
    </div>
  );
}
