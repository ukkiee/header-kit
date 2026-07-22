import type { ReactNode } from 'react';
import { ALL_RESOURCE_TYPES, REQUEST_METHODS } from '@/core/rules';
import type { RuleConditions } from '@/core/schema';
import { Chip } from '@/ui/chip';
import { Input } from '@/ui/input';
import { NoteText } from '@/ui/note-text';
import { useT } from '@/ui/i18n-context';

function epochToLocalInput(ms: number | undefined): string {
  if (ms === undefined || ms <= 0) return '';
  const date = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

function localInputToEpoch(value: string): number | undefined {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) || ms <= 0 ? undefined : ms;
}

function toggleItem<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');

/** 라벨 위, 입력 아래 — 폼 필드 공통 셸 (RuleForm과 동일 문법). */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
      {label}
      {children}
    </label>
  );
}

export interface RuleConditionsFieldsProps {
  conditions: RuleConditions;
  onChange: (next: RuleConditions) => void;
}

/**
 * 규칙 조건 편집 (ADR 0010) — 접이식 disclosure 안의 필드들.
 * 도메인 계열은 쉼표 구분 CSV 입력, 리소스/메서드는 다중 선택 칩.
 */
export function RuleConditionsFields({ conditions, onChange }: RuleConditionsFieldsProps) {
  const t = useT();
  const csvField = (
    labelKey: 'condExcludedDomains' | 'condInitiator' | 'condTabDomains',
    field: 'excludedDomains' | 'initiatorDomains' | 'tabDomains',
    note?: string,
  ) => (
    <Field label={t(labelKey)}>
      <Input
        size="sm"
        defaultValue={(conditions[field] ?? []).join(', ')}
        onChange={(e) => onChange({ ...conditions, [field]: splitCsv(e.target.value) })}
        placeholder="a.example.com, b.example.com"
      />
      {note && <NoteText as="span">{note}</NoteText>}
    </Field>
  );

  return (
    <div className="flex flex-col gap-3">
      {csvField('condExcludedDomains', 'excludedDomains', t('commaHint'))}
      <Field label={t('condResourceTypes')}>
        <div className="flex flex-wrap gap-1">
          {ALL_RESOURCE_TYPES.map((type) => (
            <Chip
              key={type}
              active={(conditions.resourceTypes ?? []).includes(type)}
              onClick={() =>
                onChange({
                  ...conditions,
                  resourceTypes: toggleItem(conditions.resourceTypes ?? [], type),
                })
              }
            >
              {type}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label={t('condMethods')}>
        <div className="flex flex-wrap gap-1">
          {REQUEST_METHODS.map((method) => (
            <Chip
              key={method}
              active={(conditions.requestMethods ?? []).includes(method)}
              onClick={() =>
                onChange({
                  ...conditions,
                  requestMethods: toggleItem(conditions.requestMethods ?? [], method),
                })
              }
            >
              {method.toUpperCase()}
            </Chip>
          ))}
        </div>
      </Field>
      {csvField('condInitiator', 'initiatorDomains', t('condInitiatorNote'))}
      {csvField('condTabDomains', 'tabDomains', t('condTabDomainNote'))}
      <Field label={t('condExpires')}>
        <Input
          type="datetime-local"
          size="sm"
          value={epochToLocalInput(conditions.expiresAt)}
          onChange={(e) => onChange({ ...conditions, expiresAt: localInputToEpoch(e.target.value) })}
          aria-label={t('ariaExpiresAt')}
        />
        <NoteText as="span">{t('condExpiresNote')}</NoteText>
      </Field>
    </div>
  );
}
