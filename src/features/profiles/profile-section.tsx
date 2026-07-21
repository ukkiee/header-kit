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
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Input } from '@/ui/input';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/ui/menu';
import { ModTableHeader } from '@/ui/mod-table';
import { Select } from '@/ui/select';
import { Tab, TabList, TabPanel, Tabs } from '@/ui/tabs';
import { ToggleSwitch } from '@/ui/toggle-switch';
import { CspRow } from '@/features/modifications/csp-row';
import { FilterRow } from '@/features/filters/filter-row';
import { HeaderRow } from '@/features/modifications/header-row';
import { RedirectRow } from '@/features/modifications/redirect-row';
import { useT } from '@/ui/i18n-context';

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

export type ProfileTab = 'modifications' | 'filters';

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
  /** 활성 탭 — 앱 레이어 뷰 상태(스펙 결정). 미지정 시 비제어(수정 탭 시작). */
  activeTab?: ProfileTab;
  onActiveTabChange?: (tab: ProfileTab) => void;
  /** 확장된 수정 행 id — 앱 레이어의 단일 확장 상태(ADR 0004). */
  expandedRowId?: string | null;
  onToggleRow?: (modificationId: string) => void;
}

export function ProfileSection({
  profile,
  index,
  profileCount,
  onCommand,
  pickerOptions,
  materialized,
  userHeaders,
  activeTab,
  onActiveTabChange,
  expandedRowId,
  onToggleRow,
}: ProfileSectionProps) {
  const t = useT();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  const meta = { name: profile.name, shortLabel: profile.shortLabel, color: profile.color };
  const updateMeta = (patch: Partial<typeof meta>) =>
    onCommand({ type: 'update-profile-meta', profileId: profile.id, meta: { ...meta, ...patch } });

  return (
    <Card as="section">
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
        <ToggleSwitch
          checked={profile.active}
          onCheckedChange={(active) =>
            onCommand({ type: 'toggle-profile', profileId: profile.id, active })
          }
          aria-label={`Toggle ${profile.name}`}
        />
        <Menu
          onOpenChange={(open) => {
            // 메뉴가 닫히면 무장된 삭제 확인을 해제 — Esc 후 재열기에 즉시 삭제 방지.
            if (!open) {
              setConfirmingDelete(false);
              clearTimeout(confirmTimer.current);
            }
          }}
        >
          <MenuTrigger render={<Button variant="ghost" size="sm" aria-label="Profile menu" />}>
            ⋯
          </MenuTrigger>
          <MenuPopup>
            <MenuItem
              disabled={index === 0}
              onClick={() =>
                onCommand({ type: 'move-profile', profileId: profile.id, toIndex: index - 1 })
              }
            >
              {t('menuMoveUp')}
            </MenuItem>
            <MenuItem
              disabled={index === profileCount - 1}
              onClick={() =>
                onCommand({ type: 'move-profile', profileId: profile.id, toIndex: index + 1 })
              }
            >
              {t('menuMoveDown')}
            </MenuItem>
            <MenuItem onClick={() => onCommand({ type: 'duplicate-profile', profileId: profile.id })}>
              {t('menuDuplicate')}
            </MenuItem>
            {/* 2단 확인: 첫 클릭은 메뉴를 열어둔 채 라벨만 '삭제?'로 — 3초 내 재클릭이 실행. */}
            <MenuItem
              tone="danger"
              closeOnClick={confirmingDelete}
              onClick={() => {
                if (confirmingDelete) {
                  onCommand({ type: 'remove-profile', profileId: profile.id });
                  setConfirmingDelete(false);
                  return;
                }
                setConfirmingDelete(true);
                confirmTimer.current = setTimeout(() => setConfirmingDelete(false), 3000);
              }}
            >
              {confirmingDelete ? t('confirmDelete') : t('menuDelete')}
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>

      <Tabs
        defaultValue="modifications"
        value={activeTab}
        onValueChange={onActiveTabChange ? (v) => onActiveTabChange(v as ProfileTab) : undefined}
      >
        <TabList>
          <Tab value="modifications" count={profile.modifications.length}>
            {t('tabModifications')}
          </Tab>
          <Tab value="filters" count={profile.filters.length}>
            {t('tabFilters')}
          </Tab>
        </TabList>

        <TabPanel value="modifications" className="flex flex-col pt-2">
          {profile.modifications.length > 0 && (
            <ModTableHeader nameLabel={t('headerName')} valueLabel={t('value')} />
          )}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {profile.modifications.map((modification) => {
              const onChange = (next: Modification) =>
                onCommand({ type: 'update-modification', profileId: profile.id, modification: next });
              const onRemove = () =>
                onCommand({
                  type: 'remove-modification',
                  profileId: profile.id,
                  modificationId: modification.id,
                });
              const expansion = {
                expanded: expandedRowId === modification.id,
                onToggleExpanded: onToggleRow ? () => onToggleRow(modification.id) : undefined,
              };
              if (modification.kind === 'csp') {
                return (
                  <CspRow key={modification.id} modification={modification} onChange={onChange} onRemove={onRemove} {...expansion} />
                );
              }
              if (modification.kind === 'redirect') {
                return (
                  <RedirectRow key={modification.id} modification={modification} onChange={onChange} onRemove={onRemove} {...expansion} />
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
                  {...expansion}
                />
              );
            })}
          </div>
        <div className="flex flex-wrap items-center gap-1">
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
            + {t('addRequestHeader')}
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
            + {t('addResponseHeader')}
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
        </div>
        </TabPanel>

        <TabPanel value="filters" className="flex flex-col gap-1.5 pt-2">
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
          <Select
            variant="ghost"
            size="sm"
            value=""
            aria-label="Add filter"
            className="self-start"
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
        </TabPanel>
      </Tabs>

    </Card>
  );
}
