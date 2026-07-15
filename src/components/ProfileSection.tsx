import { Switch } from '@base-ui-components/react/switch';
import { useEffect, useRef, useState } from 'react';
import type { Command } from '@/core/commands';
import {
  createFilter,
  createHeaderModification,
  createModification,
  type FilterKind,
  type Modification,
  type ModificationKind,
  type Profile,
} from '@/core/schema';
import type { MessageKey } from '@/core/i18n';
import type { TabPickerOptions } from '@/platform/tabs';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
import { CspRow } from './CspRow';
import { FilterRow } from './FilterRow';
import { HeaderRow } from './HeaderRow';
import { RedirectRow } from './RedirectRow';
import { useT } from './i18n-context';

const FILTER_KINDS: Array<{ kind: FilterKind; labelKey: MessageKey }> = [
  { kind: 'url', labelKey: 'filterUrl' },
  { kind: 'exclude-url', labelKey: 'filterExcludeUrl' },
  { kind: 'resource-type', labelKey: 'filterResourceType' },
  { kind: 'request-method', labelKey: 'filterRequestMethod' },
  { kind: 'initiator-domain', labelKey: 'filterInitiatorDomain' },
  { kind: 'tab', labelKey: 'filterTab' },
  { kind: 'tab-group', labelKey: 'filterTabGroup' },
  { kind: 'window', labelKey: 'filterWindow' },
  { kind: 'tab-domain', labelKey: 'filterTabDomain' },
  { kind: 'time', labelKey: 'filterTime' },
];

export interface ProfileSectionProps {
  profile: Profile;
  index: number;
  profileCount: number;
  onCommand: (command: Command) => void;
  pickerOptions?: TabPickerOptions;
  /** Placeholder 실체화 구역 — Modification id 키. */
  materialized?: Record<string, string>;
  /** 헤더 이름 autocomplete 사용자 항목. */
  userHeaders?: readonly string[];
}

export function ProfileSection({
  profile,
  index,
  profileCount,
  onCommand,
  pickerOptions,
  materialized,
  userHeaders,
}: ProfileSectionProps) {
  const t = useT();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  const meta = { name: profile.name, shortLabel: profile.shortLabel, color: profile.color };
  const updateMeta = (patch: Partial<typeof meta>) =>
    onCommand({ type: 'update-profile-meta', profileId: profile.id, meta: { ...meta, ...patch } });

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={profile.color}
          onChange={(e) => updateMeta({ color: e.target.value })}
          aria-label="Badge color"
          className="size-6 shrink-0 cursor-pointer rounded border-none bg-transparent p-0"
        />
        <input
          type="text"
          value={profile.name}
          onChange={(e) => updateMeta({ name: e.target.value })}
          aria-label="Profile name"
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-sm font-medium outline-none focus:border-blue-500"
        />
        <Input
          align="center"
          value={profile.shortLabel}
          onChange={(e) => updateMeta({ shortLabel: e.target.value.slice(0, 2) })}
          aria-label="Badge label"
          maxLength={2}
          className="w-10"
        />
        <Switch.Root
          checked={profile.active}
          onCheckedChange={(active) =>
            onCommand({ type: 'toggle-profile', profileId: profile.id, active })
          }
          aria-label={`Toggle ${profile.name}`}
          className="flex h-5 w-9 shrink-0 rounded-full bg-zinc-300 p-0.5 transition-colors data-[checked]:bg-blue-600 dark:bg-zinc-700"
        >
          <Switch.Thumb className="size-4 rounded-full bg-white transition-transform data-[checked]:translate-x-4" />
        </Switch.Root>
      </div>

      <div className="flex flex-col gap-1.5">
        {profile.modifications.map((modification) => {
          const onChange = (next: Modification) =>
            onCommand({ type: 'update-modification', profileId: profile.id, modification: next });
          const onRemove = () =>
            onCommand({
              type: 'remove-modification',
              profileId: profile.id,
              modificationId: modification.id,
            });
          if (modification.kind === 'csp') {
            return (
              <CspRow key={modification.id} modification={modification} onChange={onChange} onRemove={onRemove} />
            );
          }
          if (modification.kind === 'redirect') {
            return (
              <RedirectRow key={modification.id} modification={modification} onChange={onChange} onRemove={onRemove} />
            );
          }
          return (
            <HeaderRow
              key={modification.id}
              modification={modification}
              materializedValue={materialized?.[modification.id]}
              userHeaders={userHeaders}
              onChange={onChange}
              onRemove={onRemove}
            />
          );
        })}
      </div>

      {profile.filters.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-dashed border-zinc-200 pt-2 dark:border-zinc-800">
          {profile.filters.map((filter) => (
            <FilterRow
              key={filter.id}
              filter={filter}
              pickerOptions={pickerOptions}
              onChange={(next) =>
                onCommand({ type: 'update-filter', profileId: profile.id, filter: next })
              }
              onRemove={() =>
                onCommand({ type: 'remove-filter', profileId: profile.id, filterId: filter.id })
              }
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onCommand({
              type: 'add-modification',
              profileId: profile.id,
              modification: createHeaderModification('request-header'),
            })
          }
        >
          + {t('requestHeader')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onCommand({
              type: 'add-modification',
              profileId: profile.id,
              modification: createHeaderModification('response-header'),
            })
          }
        >
          + {t('responseHeader')}
        </Button>
        <Select
          variant="ghost"
          size="sm"
          value=""
          aria-label="Add modification"
          onChange={(e) => {
            const kind = e.target.value as ModificationKind | '';
            if (kind !== '') {
              onCommand({
                type: 'add-modification',
                profileId: profile.id,
                modification: createModification(kind),
              });
            }
          }}
        >
          <option value="">+ {t('moreModification')}</option>
          <option value="cookie">{t('modCookie')}</option>
          <option value="set-cookie">{t('modSetCookie')}</option>
          <option value="csp">{t('modCsp')}</option>
          <option value="redirect">{t('modRedirect')}</option>
        </Select>
        <Select
          variant="ghost"
          size="sm"
          value=""
          aria-label="Add filter"
          onChange={(e) => {
            const kind = e.target.value as FilterKind | '';
            if (kind !== '') {
              onCommand({ type: 'add-filter', profileId: profile.id, filter: createFilter(kind) });
            }
          }}
        >
          <option value="">+ {t('addFilterMenu')}</option>
          {FILTER_KINDS.map(({ kind, labelKey }) => (
            <option key={kind} value={kind}>
              {t(labelKey)}
            </option>
          ))}
        </Select>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          disabled={index === 0}
          aria-label="Move profile up (wins conflicts)"
          onClick={() =>
            onCommand({ type: 'move-profile', profileId: profile.id, toIndex: index - 1 })
          }
        >
          ▲
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={index === profileCount - 1}
          aria-label="Move profile down"
          onClick={() =>
            onCommand({ type: 'move-profile', profileId: profile.id, toIndex: index + 1 })
          }
        >
          ▼
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Duplicate profile"
          onClick={() => onCommand({ type: 'duplicate-profile', profileId: profile.id })}
        >
          ⧉
        </Button>
        <Button
          variant="danger"
          size="sm"
          aria-label={confirmingDelete ? 'Confirm delete' : 'Delete profile'}
          onClick={() => {
            if (confirmingDelete) {
              onCommand({ type: 'remove-profile', profileId: profile.id });
              return;
            }
            setConfirmingDelete(true);
            confirmTimer.current = setTimeout(() => setConfirmingDelete(false), 3000);
          }}
        >
          {confirmingDelete ? 'Delete?' : '✕'}
        </Button>
      </div>
    </section>
  );
}
