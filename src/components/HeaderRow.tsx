import { hasPlaceholders } from '@/core/placeholder';
import { isRequestAppendAllowed } from '@/core/rules';
import type { Modification } from '@/core/schema';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { Chip } from '@/ui/Chip';
import { Input } from '@/ui/Input';
import { KindLabel } from '@/ui/KindLabel';
import { NoteText } from '@/ui/NoteText';
import { Select } from '@/ui/Select';
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
    <Card variant="row">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={modification.enabled}
          onChange={(e) => onChange({ ...modification, enabled: e.target.checked })}
          aria-label="Enable modification"
        />
        {isTogglableTarget ? (
          <Select
            variant="bordered"
            size="md"
            value={modification.kind}
            onChange={(e) => onChange({ ...modification, kind: e.target.value } as Modification)}
            aria-label="Header target"
          >
            <option value="request-header">{t('requestHeaderShort')}</option>
            <option value="response-header">{t('responseHeaderShort')}</option>
          </Select>
        ) : (
          <KindLabel>{label}</KindLabel>
        )}
        {hasName && (
          <HeaderNameInput
            value={nameValue}
            onChange={setName}
            userHeaders={userHeaders}
            className="w-32"
          />
        )}
        <Input
          value={modification.value}
          onChange={(e) => onChange({ ...modification, value: e.target.value })}
          placeholder={isCookie ? 'value' : t('value')}
          aria-label="Header value"
          className="flex-1"
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
        <Chip
          active={modification.mode === 'override'}
          onClick={() => onChange({ ...modification, mode: 'override' })}
        >
          {t('override')}
        </Chip>
        {appendAllowed && (
          <Chip
            active={modification.mode === 'append'}
            onClick={() => onChange({ ...modification, mode: 'append' })}
          >
            {t('append')}
          </Chip>
        )}
        {isEmpty && (
          <>
            <NoteText as="span" indent="inline">{t('emptyArrow')}</NoteText>
            <Chip
              active={modification.emptyMeans === 'remove'}
              onClick={() => onChange({ ...modification, emptyMeans: 'remove' })}
            >
              {t('remove')}
            </Chip>
            <Chip
              active={modification.emptyMeans === 'send-empty'}
              onClick={() => onChange({ ...modification, emptyMeans: 'send-empty' })}
            >
              {t('sendEmpty')}
            </Chip>
          </>
        )}
        <Input
          variant="ghost"
          size="xs"
          value={modification.comment}
          onChange={(e) => onChange({ ...modification, comment: e.target.value })}
          placeholder={t('comment')}
          aria-label="Comment"
          className="ml-auto w-40 text-zinc-500"
        />
      </div>

      {isResponseHeader && <NoteText indent="row">{t('responsePanelNote')}</NoteText>}
      {withPlaceholders && (
        <NoteText indent="row">
          {t('placeholderNote')}
          {materializedValue !== undefined && (
            <span className="ml-1 font-mono text-zinc-500">→ {materializedValue}</span>
          )}
        </NoteText>
      )}
    </Card>
  );
}
