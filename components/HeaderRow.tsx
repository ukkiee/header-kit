import type { RequestHeaderModification } from '@/core/schema';
import { Button } from './Button';

export interface HeaderRowProps {
  modification: RequestHeaderModification;
  onChange: (next: RequestHeaderModification) => void;
  onRemove: () => void;
}

export function HeaderRow({ modification, onChange, onRemove }: HeaderRowProps) {
  return (
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
  );
}
