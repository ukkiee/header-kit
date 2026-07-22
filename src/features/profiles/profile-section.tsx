import { useEffect, useRef, useState } from 'react';
import { Ellipsis, Plus } from 'lucide-react';
import type { Command } from '@/core/commands';
import type { Modification, Profile } from '@/core/schema';
import { format, type MessageKey } from '@/core/i18n';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Input } from '@/ui/input';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/ui/menu';
import { ToggleSwitch } from '@/ui/toggle-switch';
import { RuleForm } from '@/features/modifications/rule-form';
import { RuleRow } from '@/features/modifications/rule-row';
import { useT } from '@/ui/i18n-context';

export interface ProfileSectionProps {
  profile: Profile;
  index: number;
  profileCount: number;
  onCommand: (command: Command) => void;
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
  userHeaders,
  onCommandWithResult,
}: ProfileSectionProps) {
  const t = useT();
  // 규칙 폼 상태 — 'new' = 생성, id = 편집, null = 목록만 (ADR 0006, 의도적 로컬)
  const [editingRule, setEditingRule] = useState<'new' | string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  /** 규칙 저장 — 원자 전송, 성공 시 폼 닫기. */
  const saveItem = async (item: Modification, op: 'add' | 'update') => {
    const command: Command =
      op === 'add'
        ? { type: 'add-modification', profileId: profile.id, modification: item }
        : { type: 'update-modification', profileId: profile.id, modification: item };
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

      {profile.modifications.length === 0 && editingRule === null && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-200 py-6 text-center dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('noRulesYet')}</p>
          <Button size="sm" onClick={() => setEditingRule('new')}>
            <Plus size={14} strokeWidth={1.75} className="mr-1" />
            {t('addRule')}
          </Button>
        </div>
      )}

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {profile.modifications.map((modification) =>
          editingRule === modification.id ? (
            <div key={modification.id} className="py-2">
              <RuleForm
                initial={modification}
                userHeaders={userHeaders}
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

      {editingRule === 'new' ? (
        <RuleForm
          userHeaders={userHeaders}
          onCancel={() => setEditingRule(null)}
          onSave={(next) => saveItem(next, 'add')}
        />
      ) : (
        // 빈 상태 CTA가 추가를 유도하므로 하단 버튼은 규칙이 있을 때만 노출한다.
        profile.modifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setEditingRule('new')}
          >
            <Plus size={14} strokeWidth={1.75} className="mr-1" />
            {t('addRule')}
          </Button>
        )
      )}

    </Card>
  );
}
