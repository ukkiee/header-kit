import { useEffect, useState } from 'react';
import { BackupPanel } from '@/components/BackupPanel';
import { Button } from '@/components/Button';
import { ProfileSection } from '@/components/ProfileSection';
import { StatusSummary } from '@/components/StatusSummary';
import { TransferPanel } from '@/components/TransferPanel';
import type { Command } from '@/core/commands';
import { createProfile, PROFILE_COLORS, type StoredState } from '@/core/schema';
import type { StatusSummary as StatusSummaryData } from '@/core/summary';
import {
  getSummary,
  loadState,
  onStateChanged,
  onSummaryChanged,
  sendCommand,
} from '@/storage/state';
import { queryTabPickerOptions, type TabPickerOptions } from '@/storage/tabs';

/** popup은 컴팩트, tab 앱은 넓은 레이아웃 — 같은 컴포넌트를 다른 마운트로 쓴다. */
export type AppSurface = 'popup' | 'tab';

export function App({ surface = 'popup' }: { surface?: AppSurface }) {
  const [state, setState] = useState<StoredState | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [pickerOptions, setPickerOptions] = useState<TabPickerOptions | undefined>(undefined);
  const [summary, setSummary] = useState<StatusSummaryData | null>(null);

  useEffect(() => {
    // 요약은 background가 적용한 결과를 발행한 것을 읽기만 한다 (독립 재컴파일 없음).
    void loadState().then(setState);
    void getSummary().then(setSummary);
    onStateChanged(() => void loadState().then(setState));
    onSummaryChanged(() => void getSummary().then(setSummary));
    void queryTabPickerOptions().then(setPickerOptions);
  }, []);

  if (!state) return null;

  const dispatch = (command: Command) => {
    void sendCommand(command).then((result) => {
      if (result.ok) {
        setState(result.state);
        setCommandError(null);
      } else {
        setCommandError(result.error);
      }
    });
  };

  // TransferPanel은 결과를 직접 받아 자기 자리에서 오류를 보여준다 (전역 배너 미사용).
  const dispatchWithResult = async (
    command: Command,
  ): Promise<{ ok: boolean; error?: string }> => {
    const result = await sendCommand(command);
    if (result.ok) {
      setState(result.state);
      return { ok: true };
    }
    return { ok: false, error: result.error };
  };

  const openTabApp = () => {
    void browser.tabs.create({ url: browser.runtime.getURL('/app.html') });
  };

  return (
    <main
      className={`mx-auto flex flex-col gap-3 bg-white p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 ${
        surface === 'tab' ? 'min-h-screen w-full max-w-3xl' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">HeaderKit</h1>
        <div className="flex items-center gap-1">
          {surface === 'popup' && (
            <Button variant="ghost" size="sm" aria-label="Open in tab" onClick={openTabApp}>
              ⧉ Tab
            </Button>
          )}
          <Button
            variant={state.paused ? 'primary' : 'ghost'}
            size="sm"
            aria-label={state.paused ? 'Resume' : 'Pause all'}
            onClick={() => dispatch({ type: 'set-paused', paused: !state.paused })}
          >
            {state.paused ? '▶ Resume' : 'II Pause'}
          </Button>
        </div>
      </div>

      {summary && <StatusSummary summary={summary} />}

      {state.paused && (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Paused — no modifications are applied.
        </p>
      )}

      {commandError && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {commandError}
        </p>
      )}

      {state.profiles.map((profile, index) => (
        <ProfileSection
          key={profile.id}
          profile={profile}
          index={index}
          profileCount={state.profiles.length}
          onCommand={dispatch}
          pickerOptions={pickerOptions}
          materialized={state.materialized}
        />
      ))}

      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() =>
          dispatch({
            type: 'add-profile',
            profile: createProfile(`Profile ${state.profiles.length + 1}`, {
              color: PROFILE_COLORS[state.profiles.length % PROFILE_COLORS.length],
            }),
          })
        }
      >
        + New profile
      </Button>

      <TransferPanel state={state} onCommand={dispatchWithResult} />
      <BackupPanel onCommand={dispatchWithResult} />
    </main>
  );
}
