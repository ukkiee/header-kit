import type { Filter } from '@/core/schema';
import { ALL_RESOURCE_TYPES, REQUEST_METHODS } from '@/core/rules';
import { Button } from './Button';

export interface FilterRowProps {
  filter: Filter;
  onChange: (next: Filter) => void;
  onRemove: () => void;
}

const KIND_LABELS: Record<Filter['kind'], string> = {
  url: 'URL',
  'exclude-url': 'Exclude',
  'resource-type': 'Type',
  'request-method': 'Method',
  'initiator-domain': 'Initiator',
};

function toggleItem<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function chipClass(selected: boolean): string {
  return `cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors ${
    selected
      ? 'bg-blue-600 text-white'
      : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
  }`;
}

function FilterEditor({ filter, onChange }: Pick<FilterRowProps, 'filter' | 'onChange'>) {
  switch (filter.kind) {
    case 'url':
    case 'exclude-url':
      return (
        <input
          type="text"
          value={filter.pattern}
          onChange={(e) => onChange({ ...filter, pattern: e.target.value })}
          placeholder="regex pattern"
          aria-label={`${KIND_LABELS[filter.kind]} pattern`}
          className="h-7 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 font-mono text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
      );
    case 'resource-type':
      return (
        <div className="flex flex-1 flex-wrap gap-1">
          {ALL_RESOURCE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={chipClass(filter.resourceTypes.includes(type))}
              onClick={() =>
                onChange({ ...filter, resourceTypes: toggleItem(filter.resourceTypes, type) })
              }
            >
              {type}
            </button>
          ))}
        </div>
      );
    case 'request-method':
      return (
        <div className="flex flex-1 flex-wrap gap-1">
          {REQUEST_METHODS.map((method) => (
            <button
              key={method}
              type="button"
              className={chipClass(filter.methods.includes(method))}
              onClick={() => onChange({ ...filter, methods: toggleItem(filter.methods, method) })}
            >
              {method.toUpperCase()}
            </button>
          ))}
        </div>
      );
    case 'initiator-domain':
      return (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <input
            type="text"
            value={filter.domain}
            onChange={(e) => onChange({ ...filter, domain: e.target.value })}
            placeholder="example.com"
            aria-label="Initiator domain"
            className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span className="text-[10px] text-zinc-400">
            Matches the request&apos;s origin — not the tab&apos;s domain.
          </span>
        </div>
      );
    default:
      return filter satisfies never;
  }
}

export function FilterRow({ filter, onChange, onRemove }: FilterRowProps) {
  return (
    <div className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={filter.enabled}
        onChange={(e) => onChange({ ...filter, enabled: e.target.checked })}
        aria-label="Enable filter"
        className="mt-1.5 size-4 accent-blue-600"
      />
      <span className="mt-1 w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
        {KIND_LABELS[filter.kind]}
      </span>
      <FilterEditor filter={filter} onChange={onChange} />
      <Button variant="danger" size="sm" onClick={onRemove} aria-label="Remove filter">
        ✕
      </Button>
    </div>
  );
}
