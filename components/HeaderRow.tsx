import { hasPlaceholders } from '@/core/placeholder';
import { isRequestAppendAllowed } from '@/core/rules';
import type { Modification } from '@/core/schema';
import { Button } from './Button';
import { HeaderNameInput } from './HeaderNameInput';
import { LargeEditor } from './LargeEditor';

export interface HeaderRowProps {
  modification: Modification;
  onChange: (next: Modification) => void;
  onRemove: () => void;
  /** Placeholder가 실체화된 현재 값 — 활성 Profile에서만 존재한다. */
  materializedValue?: string;
  /** 헤더 이름 autocomplete에 더할 사용자 등록 항목. */
  userHeaders?: readonly string[];
}

function chip(active: boolean): string {
  return `cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors ${
    active
      ? 'bg-blue-600 text-white'
      : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
  }`;
}

export function HeaderRow({
  modification,
  onChange,
  onRemove,
  materializedValue,
  userHeaders = [],
}: HeaderRowProps) {
  const withPlaceholders = hasPlaceholders(modification.value);
  const isRequest = modification.kind === 'request-header';
  // 요청 헤더 append는 허용 목록 헤더에만 노출한다 (불가능한 상태를 만들지 않음).
  const appendAllowed = !isRequest || isRequestAppendAllowed(modification.name);
  const isEmpty = modification.value === '';

  const setKind = (kind: Modification['kind']) => onChange({ ...modification, kind });

  // 이름을 바꿀 때, 요청 헤더 append가 허용 목록 밖으로 벗어나면 mode를 override로
  // 되돌린다 — append 칩이 숨겨진 채 stale append 상태가 남지 않도록.
  const setName = (name: string) => {
    const stillAppendable = modification.kind !== 'request-header' || isRequestAppendAllowed(name);
    onChange({
      ...modification,
      name,
      mode: modification.mode === 'append' && !stillAppendable ? 'override' : modification.mode,
    });
  };

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
        <select
          value={modification.kind}
          onChange={(e) => setKind(e.target.value as Modification['kind'])}
          aria-label="Header target"
          className="h-8 cursor-pointer rounded-md border border-zinc-300 bg-white px-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="request-header">Req</option>
          <option value="response-header">Res</option>
        </select>
        <HeaderNameInput
          value={modification.name}
          onChange={setName}
          userHeaders={userHeaders}
          className="h-8 w-32 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="text"
          value={modification.value}
          onChange={(e) => onChange({ ...modification, value: e.target.value })}
          placeholder="Value"
          aria-label="Header value"
          className="h-8 flex-1 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <LargeEditor
          title={`Value — ${modification.name || 'header'}`}
          value={modification.value}
          onCommit={(value) => onChange({ ...modification, value })}
          triggerLabel="⤢"
        />
        <Button variant="danger" size="sm" onClick={onRemove} aria-label="Remove modification">
          ✕
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1 pl-6">
        <button
          type="button"
          className={chip(modification.mode === 'override')}
          onClick={() => onChange({ ...modification, mode: 'override' })}
        >
          Override
        </button>
        {appendAllowed && (
          <button
            type="button"
            className={chip(modification.mode === 'append')}
            onClick={() => onChange({ ...modification, mode: 'append' })}
          >
            Append
          </button>
        )}
        {isEmpty && (
          <>
            <span className="ml-1 text-[10px] text-zinc-400">empty →</span>
            <button
              type="button"
              className={chip(modification.emptyMeans === 'remove')}
              onClick={() => onChange({ ...modification, emptyMeans: 'remove' })}
            >
              Remove
            </button>
            <button
              type="button"
              className={chip(modification.emptyMeans === 'send-empty')}
              onClick={() => onChange({ ...modification, emptyMeans: 'send-empty' })}
            >
              Send empty
            </button>
          </>
        )}
        <input
          type="text"
          value={modification.comment}
          onChange={(e) => onChange({ ...modification, comment: e.target.value })}
          placeholder="comment"
          aria-label="Comment"
          className="ml-auto h-6 w-40 rounded border border-transparent bg-transparent px-1 text-[11px] text-zinc-500 outline-none focus:border-zinc-300 dark:focus:border-zinc-700"
        />
      </div>

      {!isRequest && (
        <p className="pl-6 text-[10px] text-zinc-400">
          Response header changes may not show in the DevTools Network panel, but they reach the
          page.
        </p>
      )}
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
