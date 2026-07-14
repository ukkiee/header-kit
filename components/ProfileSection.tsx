import { Switch } from '@base-ui-components/react/switch';
import { useEffect, useRef, useState } from 'react';
import type { Command } from '@/core/commands';
import {
  createRequestHeaderModification,
  type Profile,
} from '@/core/schema';
import { Button } from './Button';
import { HeaderRow } from './HeaderRow';

export interface ProfileSectionProps {
  profile: Profile;
  index: number;
  profileCount: number;
  onCommand: (command: Command) => void;
}

export function ProfileSection({ profile, index, profileCount, onCommand }: ProfileSectionProps) {
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
        <input
          type="text"
          value={profile.shortLabel}
          onChange={(e) => updateMeta({ shortLabel: e.target.value.slice(0, 2) })}
          aria-label="Badge label"
          maxLength={2}
          className="h-8 w-10 rounded-md border border-zinc-300 bg-white px-1 text-center text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
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
        {profile.modifications.map((modification) =>
          modification.kind === 'request-header' ? (
            <HeaderRow
              key={modification.id}
              modification={modification}
              onChange={(next) =>
                onCommand({
                  type: 'update-modification',
                  profileId: profile.id,
                  modification: next,
                })
              }
              onRemove={() =>
                onCommand({
                  type: 'remove-modification',
                  profileId: profile.id,
                  modificationId: modification.id,
                })
              }
            />
          ) : null,
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onCommand({
              type: 'add-modification',
              profileId: profile.id,
              modification: createRequestHeaderModification(),
            })
          }
        >
          + Request header
        </Button>
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
