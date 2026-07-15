import { hasPlaceholders } from '@/core/placeholder';
import { isRequestAppendAllowed } from '@/core/rules';
import type { Modification } from '@/core/schema';
import { Button } from './Button';
import { HeaderNameInput } from './HeaderNameInput';
import { useT } from './i18n-context';
import { LargeEditor } from './LargeEditor';

/** 값을 가진 Modification 종류 (header/cookie/set-cookie). */
type ValueModification = Extract<Modification, { value: string }>;

export interface HeaderRowProps {
  modification: ValueModification;
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
  const t = useT();
  const withPlaceholders = hasPlaceholders(modification.value);
  const kind = modification.kind;
  const isRequestHeader = kind === 'request-header';
  const isResponseHeader = kind === 'response-header';
  const isCookie = kind === 'cookie';
  const hasName = isRequestHeader || isResponseHeader || isCookie;
  const nameValue = hasName ? modification.name : '';
  const isTogglableTarget = isRequestHeader || isResponseHeader;
  // append 가능 여부: cookie는 Cookie(허용목록), set-cookie·response는 제약 없음.
  const appendAllowed = !isRequestHeader || isRequestAppendAllowed(modification.name);
  const isEmpty = modification.value === '';

  const setName = (name: string) => {
    if (!isRequestHeader) return onChange({ ...modification, name } as Modification);
    const stillAppendable = isRequestAppendAllowed(name);
    onChange({
      ...modification,
      name,
      mode: modification.mode === 'append' && !stillAppendable ? 'override' : modification.mode,
    } as Modification);
  };

  const label = isCookie ? 'Cookie' : kind === 'set-cookie' ? 'Set-Cookie' : null;

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
        {isTogglableTarget ? (
          <select
            value={modification.kind}
            onChange={(e) => onChange({ ...modification, kind: e.target.value } as Modification)}
            aria-label="Header target"
            className="h-8 cursor-pointer rounded-md border border-zinc-300 bg-white px-1 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="request-header">{t('requestHeaderShort')}</option>
            <option value="response-header">{t('responseHeaderShort')}</option>
          </select>
        ) : (
          <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            {label}
          </span>
        )}
        {hasName && (
          <HeaderNameInput
            value={nameValue}
            onChange={setName}
            userHeaders={userHeaders}
            className="h-8 w-32 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        )}
        <input
          type="text"
          value={modification.value}
          onChange={(e) => onChange({ ...modification, value: e.target.value })}
          placeholder={isCookie ? 'value' : t('value')}
          aria-label="Header value"
          className="h-8 flex-1 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <LargeEditor
          title={`${t('value')} — ${label ?? (nameValue || 'header')}`}
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
          {t('override')}
        </button>
        {appendAllowed && (
          <button
            type="button"
            className={chip(modification.mode === 'append')}
            onClick={() => onChange({ ...modification, mode: 'append' })}
          >
            {t('append')}
          </button>
        )}
        {isEmpty && (
          <>
            <span className="ml-1 text-[10px] text-zinc-400">{t('emptyArrow')}</span>
            <button
              type="button"
              className={chip(modification.emptyMeans === 'remove')}
              onClick={() => onChange({ ...modification, emptyMeans: 'remove' })}
            >
              {t('remove')}
            </button>
            <button
              type="button"
              className={chip(modification.emptyMeans === 'send-empty')}
              onClick={() => onChange({ ...modification, emptyMeans: 'send-empty' })}
            >
              {t('sendEmpty')}
            </button>
          </>
        )}
        <input
          type="text"
          value={modification.comment}
          onChange={(e) => onChange({ ...modification, comment: e.target.value })}
          placeholder={t('comment')}
          aria-label="Comment"
          className="ml-auto h-6 w-40 rounded border border-transparent bg-transparent px-1 text-[11px] text-zinc-500 outline-none focus:border-zinc-300 dark:focus:border-zinc-700"
        />
      </div>

      {isResponseHeader && (
        <p className="pl-6 text-[10px] text-zinc-400">{t('responsePanelNote')}</p>
      )}
      {withPlaceholders && (
        <p className="pl-6 text-[10px] text-zinc-400">
          {t('placeholderNote')}
          {materializedValue !== undefined && (
            <span className="ml-1 font-mono text-zinc-500">→ {materializedValue}</span>
          )}
        </p>
      )}
    </div>
  );
}
