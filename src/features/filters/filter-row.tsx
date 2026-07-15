import { useEffect, useState } from 'react';
import type { Filter } from '@/core/schema';
import { ALL_RESOURCE_TYPES, REQUEST_METHODS } from '@/core/rules';
import type { TabPickerOptions } from '@/platform/tabs';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import { Chip } from '@/ui/chip';
import { Input, type InputProps } from '@/ui/input';
import { KindLabel } from '@/ui/kind-label';
import { NoteText } from '@/ui/note-text';
import { Select } from '@/ui/select';

/**
 * 패턴류 입력은 로컬 초안으로 편집하고 blur/Enter에서만 커밋한다 —
 * 저장 시점 regex 검증이 타이핑 중간 상태('(', '[' …)를 거부하면
 * 통제 입력이 되돌아가 입력 자체가 불가능해지기 때문.
 */
function DraftInput({
  value,
  onCommit,
  ...props
}: { value: string; onCommit: (next: string) => void } & Omit<InputProps, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      {...props}
    />
  );
}

export interface FilterRowProps {
  filter: Filter;
  onChange: (next: Filter) => void;
  onRemove: () => void;
  /** 탭 계열 Filter 선택기의 표시 옵션 — 팝업이 tabs API에서 로드해 내려준다. */
  pickerOptions?: TabPickerOptions;
}

const KIND_LABELS: Record<Filter['kind'], string> = {
  url: 'URL',
  'exclude-url': 'Exclude',
  'resource-type': 'Type',
  'request-method': 'Method',
  'initiator-domain': 'Initiator',
  tab: 'Tab',
  'tab-group': 'Group',
  window: 'Window',
  'tab-domain': 'Tab dom.',
  time: 'Until',
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
      {!known && value !== -1 && (
        <option value={value}>{`(closed) #${value}`}</option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

function toggleItem<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function FilterEditor({
  filter,
  onChange,
  pickerOptions,
}: Pick<FilterRowProps, 'filter' | 'onChange' | 'pickerOptions'>) {
  switch (filter.kind) {
    case 'tab':
      return (
        <PickerSelect
          value={filter.tabId}
          options={(pickerOptions?.tabs ?? []).map((t) => ({ value: t.tabId, label: t.label }))}
          placeholder="Select a tab…"
          ariaLabel="Tab"
          onSelect={(tabId) => onChange({ ...filter, tabId })}
        />
      );
    case 'tab-group':
      return (
        <PickerSelect
          value={filter.groupId}
          options={(pickerOptions?.groups ?? []).map((g) => ({ value: g.groupId, label: g.label }))}
          placeholder="Select a tab group…"
          ariaLabel="Tab group"
          onSelect={(groupId) => onChange({ ...filter, groupId })}
        />
      );
    case 'window':
      return (
        <PickerSelect
          value={filter.windowId}
          options={(pickerOptions?.windows ?? []).map((w) => ({ value: w.windowId, label: w.label }))}
          placeholder="Select a window…"
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
          <NoteText as="span">
            Applies to every request from tabs on this domain — third-party included.
          </NoteText>
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
          <NoteText as="span">
            The profile turns off automatically at this time.
          </NoteText>
        </div>
      );
    case 'url':
    case 'exclude-url':
      return (
        <DraftInput
          value={filter.pattern}
          onCommit={(pattern) => onChange({ ...filter, pattern })}
          placeholder="regex pattern"
          aria-label={`${KIND_LABELS[filter.kind]} pattern`}
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
          <NoteText as="span">
            Matches the request&apos;s origin — not the tab&apos;s domain.
          </NoteText>
        </div>
      );
    default:
      return filter satisfies never;
  }
}

export function FilterRow({ filter, onChange, onRemove, pickerOptions }: FilterRowProps) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        offset="row"
        checked={filter.enabled}
        onChange={(e) => onChange({ ...filter, enabled: e.target.checked })}
        aria-label="Enable filter"
      />
      <KindLabel offset="filter">{KIND_LABELS[filter.kind]}</KindLabel>
      <FilterEditor filter={filter} onChange={onChange} pickerOptions={pickerOptions} />
      <Button variant="danger" size="sm" onClick={onRemove} aria-label="Remove filter">
        ✕
      </Button>
    </div>
  );
}
