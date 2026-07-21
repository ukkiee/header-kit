import { hasPlaceholders } from '@/core/placeholder';
import { isRequestAppendAllowed } from '@/core/rules';
import type { Modification } from '@/core/schema';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import { Chip } from '@/ui/chip';
import { Input } from '@/ui/input';
import { KindLabel } from '@/ui/kind-label';
import { ModRowShell, type RowExpansionProps } from '@/ui/mod-table';
import { NoteText } from '@/ui/note-text';
import { Select } from '@/ui/select';
import { HeaderNameInput } from './header-name-input';
import { useT } from '@/ui/i18n-context';
import { LargeEditor } from '@/ui/large-editor';

/** 값을 가진 Modification 종류 (header/cookie/set-cookie). */
type ValueModification = Extract<Modification, { value: string }>;

export interface HeaderRowProps extends RowExpansionProps {
  modification: ValueModification;
  onChange: (next: Modification) => void;
  onRemove: () => void;
  /** Placeholder가 실체화된 현재 값 — 활성 Profile에서만 존재한다. */
  materializedValue?: string;
  /** 헤더 이름 autocomplete에 더할 사용자 등록 항목. */
  userHeaders?: readonly string[];
}

/**
 * 테이블형 수정 행 — 기본 1줄(체크박스·종류·이름·값), 선택 시에만 모드·주석 등
 * 옵션이 확장된다. 세부 옵션의 밀도는 필요할 때만 지불한다 (ADR 0004).
 */
export function HeaderRow({
  modification,
  onChange,
  onRemove,
  materializedValue,
  userHeaders = [],
  expanded,
  onToggleExpanded,
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
    <ModRowShell
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      cells={
        <>
          <Checkbox
            checked={modification.enabled}
            onChange={(e) => onChange({ ...modification, enabled: e.target.checked })}
            aria-label={t('ariaEnableModification')}
          />
          {isTogglableTarget ? (
            <Select
              variant="ghost"
              size="sm"
              value={modification.kind}
              onChange={(e) => onChange({ ...modification, kind: e.target.value } as Modification)}
              aria-label={t('ariaHeaderTarget')}
            >
              <option value="request-header">{t('requestHeaderShort')}</option>
              <option value="response-header">{t('responseHeaderShort')}</option>
            </Select>
          ) : (
            <KindLabel width="auto">{label}</KindLabel>
          )}
          {hasName ? (
            <HeaderNameInput
              variant="ghost"
              size="sm"
              value={nameValue}
              onChange={setName}
              userHeaders={userHeaders}
              className="min-w-0"
            />
          ) : (
            <span />
          )}
          <Input
            variant="ghost"
            size="sm"
            value={modification.value}
            onChange={(e) => onChange({ ...modification, value: e.target.value })}
            placeholder={isCookie ? 'value' : t('value')}
            aria-label={t('ariaHeaderValue')}
            className="min-w-0 truncate"
          />
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-1">
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
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <LargeEditor
            title={`${t('value')} — ${label ?? (nameValue || 'header')}`}
            value={modification.value}
            onCommit={(value) => onChange({ ...modification, value })}
            triggerLabel="⤢"
          />
          <Button variant="danger" size="sm" onClick={onRemove} aria-label={t('ariaRemoveModification')}>
            ✕
          </Button>
        </div>
      </div>

      <Input
        variant="ghost"
        size="xs"
        value={modification.comment}
        onChange={(e) => onChange({ ...modification, comment: e.target.value })}
        placeholder={t('comment')}
        aria-label={t('comment')}
        className="w-full text-zinc-500"
      />

      {isResponseHeader && <NoteText>{t('responsePanelNote')}</NoteText>}
      {withPlaceholders && (
        <NoteText>
          {t('placeholderNote')}
          {materializedValue !== undefined && (
            <span className="ml-1 font-mono text-zinc-500">→ {materializedValue}</span>
          )}
        </NoteText>
      )}
    </ModRowShell>
  );
}
