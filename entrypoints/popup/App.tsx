import { Switch } from '@base-ui-components/react/switch';
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { HeaderRow } from '@/components/HeaderRow';
import type { Command } from '@/core/commands';
import { createRequestHeaderModification, type StoredState } from '@/core/schema';
import { loadState, onStateChanged, sendCommand } from '@/storage/state';

export function App() {
  const [state, setState] = useState<StoredState | null>(null);

  useEffect(() => {
    void loadState().then(setState);
    onStateChanged(() => void loadState().then(setState));
  }, []);

  if (!state) return null;

  const dispatch = (command: Command) => {
    void sendCommand(command).then(setState);
  };

  return (
    <main className="bg-white p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <h1 className="mb-3 text-base font-semibold">HeaderKit</h1>
      {state.profiles.map((profile) => (
        <section key={profile.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{profile.name}</span>
            <Switch.Root
              checked={profile.active}
              onCheckedChange={(active) =>
                dispatch({ type: 'toggle-profile', profileId: profile.id, active })
              }
              aria-label={`Toggle ${profile.name}`}
              className="flex h-5 w-9 rounded-full bg-zinc-300 p-0.5 transition-colors data-[checked]:bg-blue-600 dark:bg-zinc-700"
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
                    dispatch({
                      type: 'update-modification',
                      profileId: profile.id,
                      modification: next,
                    })
                  }
                  onRemove={() =>
                    dispatch({
                      type: 'remove-modification',
                      profileId: profile.id,
                      modificationId: modification.id,
                    })
                  }
                />
              ) : null,
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() =>
              dispatch({
                type: 'add-modification',
                profileId: profile.id,
                modification: createRequestHeaderModification(),
              })
            }
          >
            + Request header
          </Button>
        </section>
      ))}
    </main>
  );
}
