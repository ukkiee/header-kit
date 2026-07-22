import { useEffect, useRef, useState } from 'react';
import { Ellipsis, Plus } from 'lucide-react';
import type { Command } from '@/core/commands';
import type { Modification, Profile } from '@/core/schema';
import { format, type MessageKey } from '@/core/i18n';
import type { TabPickerOptions } from '@/platform/tabs';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Input } from '@/ui/input';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/ui/menu';
import { ToggleSwitch } from '@/ui/toggle-switch';
import { ConditionRow } from '@/features/filters/condition-row';
import { isRuleItem, RuleForm, type FormItem } from '@/features/modifications/rule-form';
import { RuleRow } from '@/features/modifications/rule-row';
import { useT } from '@/ui/i18n-context';

export interface ProfileSectionProps {
  profile: Profile;
  index: number;
  profileCount: number;
  onCommand: (command: Command) => void;
  pickerOptions?: TabPickerOptions;
  /** 헤더 이름 autocomplete 사용자 항목. */
  userHeaders?: readonly string[];
  /** 규칙 저장 — 권위 실행 결과를 폼이 돌려받아 거부를 인라인으로 보여준다. */
  onCommandWithResult: (command: Command) => Promise<{ ok: boolean; error?: string }>;
}

export function ProfileSection({
  profile,
  index,
  profileCount,
  onCommand,
  pickerOptions,
  userHeaders,
  onCommandWithResult,
}: ProfileSectionProps) {
  const t = useT();
  // 규칙 폼 상태 — 'new' = 생성, id = 편집, null = 목록만 (ADR 0006, 의도적 로컬)
  const [editingRule, setEditingRule] = useState<'new' | string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  /** 폼 항목 저장 — 규칙/조건을 kind로 판별해 해당 커맨드로 원자 전송 (ADR 0009). */
  const saveItem = async (item: FormItem, op: 'add' | 'update') => {
    const command: Command = isRuleItem(item)
      ? op === 'add'
        ? { type: 'add-modification', profileId: profile.id, modification: item }
        : { type: 'update-modification', profileId: profile.id, modification: item }
      : op === 'add'
        ? { type: 'add-filter', profileId: profile.id, filter: item }
        : { type: 'update-filter', profileId: profile.id, filter: item };
    const result = await onCommandWithResult(command);
    if (result.ok) setEditingRule(null);
    return result;
  };

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
          aria-label={t('ariaBadgeColor')}
          className="size-6 shrink-0 cursor-pointer rounded border-none bg-transparent p-0"
        />
        <input
          type="text"
          value={profile.name}
          onChange={(e) => updateMeta({ name: e.target.value })}
          aria-label={t('ariaProfileName')}
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-sm font-medium outline-none focus:border-blue-500"
        />
        <Input
          align="center"
          value={profile.shortLabel}
          onChange={(e) => updateMeta({ shortLabel: e.target.value.slice(0, 2) })}
          aria-label={t('ariaBadgeLabel')}
          maxLength={2}
          className="w-10"
        />
        <ToggleSwitch
          checked={profile.active}
          onCheckedChange={(active) =>
            onCommand({ type: 'toggle-profile', profileId: profile.id, active })
          }
          aria-label={format(t('ariaToggleProfile'), { name: profile.name })}
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
          <MenuTrigger render={<Button variant="ghost" size="sm" aria-label={t('ariaProfileMenu')} />}>
            <Ellipsis size={16} strokeWidth={1.75} />
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

      {profile.modifications.length === 0 && profile.filters.length === 0 && editingRule === null && (
        <p className="py-1 text-xs text-zinc-500 dark:text-zinc-400">{t('noRulesYet')}</p>
      )}

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {profile.modifications.map((modification) =>
          editingRule === modification.id ? (
            <div key={modification.id} className="py-2">
              <RuleForm
                initial={modification}
                userHeaders={userHeaders}
                pickerOptions={pickerOptions}
                onCancel={() => setEditingRule(null)}
                onSave={(next) => saveItem(next, 'update')}
              />
            </div>
          ) : (
            <RuleRow
              key={modification.id}
              modification={modification}
              onToggleEnabled={(enabled) =>
                onCommand({
                  type: 'update-modification',
                  profileId: profile.id,
                  modification: { ...modification, enabled } as Modification,
                })
              }
              onEdit={() => setEditingRule(modification.id)}
              onRemove={() =>
                onCommand({
                  type: 'remove-modification',
                  profileId: profile.id,
                  modificationId: modification.id,
                })
              }
            />
          ),
        )}
      </div>

      {profile.filters.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
              {t('conditionsCaption')}
            </span>
            <span className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {profile.filters.map((filter) =>
              editingRule === filter.id ? (
                <div key={filter.id} className="py-2">
                  <RuleForm
                    initial={filter}
                    userHeaders={userHeaders}
                    pickerOptions={pickerOptions}
                    onCancel={() => setEditingRule(null)}
                    onSave={(next) => saveItem(next, 'update')}
                  />
                </div>
              ) : (
                <ConditionRow
                  key={filter.id}
                  filter={filter}
                  pickerOptions={pickerOptions}
                  onToggleEnabled={(enabled) =>
                    onCommand({ type: 'update-filter', profileId: profile.id, filter: { ...filter, enabled } })
                  }
                  onEdit={() => setEditingRule(filter.id)}
                  onRemove={() =>
                    onCommand({ type: 'remove-filter', profileId: profile.id, filterId: filter.id })
                  }
                />
              ),
            )}
          </div>
        </>
      )}

      {editingRule === 'new' ? (
        <RuleForm
          userHeaders={userHeaders}
          pickerOptions={pickerOptions}
          onCancel={() => setEditingRule(null)}
          onSave={(next) => saveItem(next, 'add')}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setEditingRule('new')}
        >
          <Plus size={14} strokeWidth={1.75} className="mr-1" />
          {t('addRule')}
        </Button>
      )}

    </Card>
  );
}
