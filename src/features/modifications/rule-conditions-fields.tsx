import { ALL_RESOURCE_TYPES, REQUEST_METHODS } from '@/core/rules';
import type { RuleConditions } from '@/core/schema';
import { ChipGroup } from '@/ui/chip-group';
import { Field, fieldCaption } from '@/ui/field';
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

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');

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

  // 칩 그룹 캡션은 span — ToggleGroup은 aria-label로 이름을 갖는다 (ADR 0011).
  const chipField = <T extends string>(
    labelKey: 'condResourceTypes' | 'condMethods',
    values: readonly T[],
    options: readonly { value: T; label: string }[],
    apply: (values: T[]) => RuleConditions,
  ) => (
    <div className="flex flex-col gap-1">
      <span className={fieldCaption}>{t(labelKey)}</span>
      <ChipGroup values={values} options={options} onValuesChange={(next) => onChange(apply(next))} aria-label={t(labelKey)} />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {csvField('condExcludedDomains', 'excludedDomains', t('commaHint'))}
      {chipField(
        'condResourceTypes',
        conditions.resourceTypes ?? [],
        ALL_RESOURCE_TYPES.map((type) => ({ value: type, label: type })),
        (resourceTypes) => ({ ...conditions, resourceTypes }),
      )}
      {chipField(
        'condMethods',
        conditions.requestMethods ?? [],
        REQUEST_METHODS.map((method) => ({ value: method, label: method.toUpperCase() })),
        (requestMethods) => ({ ...conditions, requestMethods }),
      )}
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
