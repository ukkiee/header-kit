import type { MessageKey } from '@/core/i18n';
import { ALL_RESOURCE_TYPES, REQUEST_METHODS } from '@/core/rules';
import type { Filter } from '@/core/schema';
import type { TabPickerOptions } from '@/platform/tabs';
import { Chip } from '@/ui/chip';
import { DraftInput } from '@/ui/draft-input';
import { useT } from '@/ui/i18n-context';
import { Input } from '@/ui/input';
import { NoteText } from '@/ui/note-text';
import { Select } from '@/ui/select';

/** 필터 종류별 짧은 라벨(KindLabel)의 메시지 키 — FilterRow·FilterEditor 공유. */
export const KIND_LABEL_KEYS: Record<Filter['kind'], MessageKey> = {
  url: 'filterShortUrl',
  'exclude-url': 'filterShortExcludeUrl',
  'resource-type': 'filterShortResourceType',
  'request-method': 'filterShortRequestMethod',
  'initiator-domain': 'filterShortInitiatorDomain',
  tab: 'filterShortTab',
  'tab-group': 'filterShortTabGroup',
  window: 'filterShortWindow',
  'tab-domain': 'filterShortTabDomain',
  time: 'filterShortTime',
};

function epochToLocalInput(ms: number): string {
  if (ms <= 0) return '';
  const date = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

function localInputToEpoch(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function toggleItem<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function PickerSelect({
  value,
  options,
  placeholder,
  ariaLabel,
  onSelect,
}: {
  value: number;
  options: Array<{ value: number; label: string }>;
  placeholder: string;
  ariaLabel: string;
  onSelect: (value: number) => void;
}) {
  const t = useT();
  const known = options.some((o) => o.value === value);
  return (
    <Select
      variant="bordered"
      size="sm"
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onSelect(Number(e.target.value))}
      className="min-w-0 flex-1"
    >
      <option value={-1} disabled>
        {placeholder}
      </option>
      {!known && value !== -1 && <option value={value}>{`${t('filterClosed')} #${value}`}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export interface FilterEditorProps {
  filter: Filter;
  onChange: (next: Filter) => void;
  /** 탭 계열 Filter 선택기의 표시 옵션 — 팝업이 tabs API에서 로드해 내려준다. */
  pickerOptions?: TabPickerOptions;
}

/** 필터 종류(10종)별 편집 UI를 분기한다 — FilterRow가 합성해 쓴다. */
export function FilterEditor({ filter, onChange, pickerOptions }: FilterEditorProps) {
  const t = useT();
  switch (filter.kind) {
    case 'tab':
      return (
        <PickerSelect
          value={filter.tabId}
          options={(pickerOptions?.tabs ?? []).map((tab) => ({ value: tab.tabId, label: tab.label }))}
          placeholder={t('filterSelectTab')}
          ariaLabel="Tab"
          onSelect={(tabId) => onChange({ ...filter, tabId })}
        />
      );
    case 'tab-group':
      return (
        <PickerSelect
          value={filter.groupId}
          options={(pickerOptions?.groups ?? []).map((g) => ({ value: g.groupId, label: g.label }))}
          placeholder={t('filterSelectTabGroup')}
          ariaLabel="Tab group"
          onSelect={(groupId) => onChange({ ...filter, groupId })}
        />
      );
    case 'window':
      return (
        <PickerSelect
          value={filter.windowId}
          options={(pickerOptions?.windows ?? []).map((w) => ({ value: w.windowId, label: w.label }))}
          placeholder={t('filterSelectWindow')}
          ariaLabel="Window"
          onSelect={(windowId) => onChange({ ...filter, windowId })}
        />
      );
    case 'tab-domain':
      return (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <DraftInput
            value={filter.domain}
            onCommit={(domain) => onChange({ ...filter, domain })}
            placeholder="example.com"
            aria-label="Tab domain"
            size="sm"
          />
          <NoteText as="span">{t('filterTabDomainNote')}</NoteText>
        </div>
      );
    case 'time':
      return (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Input
            type="datetime-local"
            size="sm"
            value={epochToLocalInput(filter.expiresAt)}
            onChange={(e) => onChange({ ...filter, expiresAt: localInputToEpoch(e.target.value) })}
            aria-label="Expires at"
          />
          <NoteText as="span">{t('filterTimeNote')}</NoteText>
        </div>
      );
    case 'url':
    case 'exclude-url':
      return (
        <DraftInput
          value={filter.pattern}
          onCommit={(pattern) => onChange({ ...filter, pattern })}
          placeholder={t('filterRegexPattern')}
          aria-label={`${t(KIND_LABEL_KEYS[filter.kind])} pattern`}
          size="sm"
          font="mono"
          className="min-w-0 flex-1"
        />
      );
    case 'resource-type':
      return (
        <div className="flex flex-1 flex-wrap gap-1">
          {ALL_RESOURCE_TYPES.map((type) => (
            <Chip
              key={type}
              active={filter.resourceTypes.includes(type)}
              onClick={() =>
                onChange({ ...filter, resourceTypes: toggleItem(filter.resourceTypes, type) })
              }
            >
              {type}
            </Chip>
          ))}
        </div>
      );
    case 'request-method':
      return (
        <div className="flex flex-1 flex-wrap gap-1">
          {REQUEST_METHODS.map((method) => (
            <Chip
              key={method}
              active={filter.methods.includes(method)}
              onClick={() => onChange({ ...filter, methods: toggleItem(filter.methods, method) })}
            >
              {method.toUpperCase()}
            </Chip>
          ))}
        </div>
      );
    case 'initiator-domain':
      return (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <DraftInput
            value={filter.domain}
            onCommit={(domain) => onChange({ ...filter, domain })}
            placeholder="example.com"
            aria-label="Initiator domain"
            size="sm"
          />
          <NoteText as="span">{t('filterInitiatorNote')}</NoteText>
        </div>
      );
    default:
      return filter satisfies never;
  }
}
