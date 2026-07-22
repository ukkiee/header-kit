import { useEffect, useState } from 'react';
import { BackupPanel } from '@/features/backup/backup-panel';
import { PreferencesPanel } from '@/features/preferences/preferences-panel';
import { ProfileSection } from '@/features/profiles/profile-section';
import { ProfileSidebar } from '@/features/profiles/profile-sidebar';
import { reconcileSelection } from '@/features/profiles/selection';
import { StatusSummary } from '@/features/status/status-summary';
import { TransferPanel } from '@/features/transfer/transfer-panel';
import { Alert } from '@/ui/alert';
import { Button } from '@/ui/button';
import { LocaleProvider } from '@/ui/i18n-context';
import type { Command } from '@/core/commands';
import { resolveLocale, t, type Locale, type MessageKey } from '@/core/i18n';
import { createProfile, PROFILE_COLORS, type StoredState } from '@/core/schema';
import type { StatusSummary as StatusSummaryData } from '@/core/summary';
import { canvas } from '@/ui/tokens';
import { ExternalLink, History, Layers, Pause, Play, Settings } from 'lucide-react';
import {
  getSummary,
  loadState,
  onStateChanged,
  onSummaryChanged,
  sendCommand,
} from '@/platform/stateStore';

/** 두 표면은 단일 셸(ADR 0005) — 차이는 크기와 '탭에서 열기' 버튼뿐. */
export type AppSurface = 'popup' | 'tab';

/** 레일 화면 — 관리 기능(백업/환경설정)이 본문 편집과 분리된다 (ADR 0005). */
type RailView = 'profiles' | 'backups' | 'preferences';

const RAIL_ITEMS: Array<{ view: RailView; Icon: typeof Layers; labelKey: MessageKey }> = [
  { view: 'profiles', Icon: Layers, labelKey: 'ariaShowProfiles' },
  { view: 'backups', Icon: History, labelKey: 'ariaShowBackups' },
  { view: 'preferences', Icon: Settings, labelKey: 'ariaShowPreferences' },
];

export function App({ surface = 'popup' }: { surface?: AppSurface }) {
  const [state, setState] = useState<StoredState | null>(null);
  // 단일 프로필 뷰(ADR 0004)의 선택 — 렌더마다 reconcileSelection으로 재조정된다.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [railView, setRailView] = useState<RailView>('profiles');
  const [commandError, setCommandError] = useState<string | null>(null);
  const [summary, setSummary] = useState<StatusSummaryData | null>(null);
  const [locale, setLocale] = useState<Locale>('en');
  const [incognitoAllowed, setIncognitoAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    // 요약은 background가 적용한 결과를 발행한 것을 읽기만 한다 (독립 재컴파일 없음).
    void loadState().then(setState);
    void getSummary().then(setSummary);
    onStateChanged(() => void loadState().then(setState));
    onSummaryChanged(() => void getSummary().then(setSummary));
    // URL의 ?locale= 오버라이드를 우선하고(언어 강제), 없으면 브라우저 UI 언어.
    const override = new URLSearchParams(window.location.search).get('locale');
    setLocale(resolveLocale(override ?? browser.i18n.getUILanguage()));
    void browser.extension.isAllowedIncognitoAccess().then(setIncognitoAllowed);
  }, []);

  if (!state) return null;

  const effectiveSelectedId = reconcileSelection(selectedId, state.profiles);
  // 재조정 결과를 상태로 커밋(렌더 중 상태 조정 패턴) — 자동 선택·폴백이 고정되어,
  // 활성 토글로 뷰가 점프하거나 옛 ID 재도입 시 선택이 되돌아가지 않는다.
  if (effectiveSelectedId !== selectedId) setSelectedId(effectiveSelectedId);
  const selectedIndex = state.profiles.findIndex((p) => p.id === effectiveSelectedId);
  const selectedProfile = selectedIndex >= 0 ? state.profiles[selectedIndex] : undefined;

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

  const createAndSelectProfile = () => {
    const profile = createProfile(`Profile ${state.profiles.length + 1}`, {
      color: PROFILE_COLORS[state.profiles.length % PROFILE_COLORS.length],
    });
    // 선택은 커맨드 성공 후 확정 — 낙관적 선택은 커밋-중-렌더 재조정이 되돌린다.
    void sendCommand({ type: 'add-profile', profile }).then((result) => {
      if (result.ok) {
        setState(result.state);
        setSelectedId(profile.id);
        setCommandError(null);
      } else {
        setCommandError(result.error);
      }
    });
  };

  const pauseButton = (
    <Button
      variant={state.paused ? 'primary' : 'ghost'}
      size="sm"
      aria-label={state.paused ? t(locale, 'resume') : t(locale, 'pause')}
      onClick={() => dispatch({ type: 'set-paused', paused: !state.paused })}
    >
      {state.paused ? <Play size={14} strokeWidth={1.75} /> : <Pause size={14} strokeWidth={1.75} />}
      <span className="ml-1.5">{state.paused ? t(locale, 'resume') : t(locale, 'pause')}</span>
    </Button>
  );

  const alerts = (
    <>
      {incognitoAllowed === false && <Alert severity="info">{t(locale, 'incognitoBlocked')}</Alert>}
      {state.paused && <Alert severity="warn">{t(locale, 'pausedNote')}</Alert>}
      {commandError && (
        <Alert severity="danger" role="alert">
          {commandError}
        </Alert>
      )}
    </>
  );

  const profileEditor = selectedProfile ? (
    <ProfileSection
      key={selectedProfile.id}
      profile={selectedProfile}
      index={selectedIndex}
      profileCount={state.profiles.length}
      onCommand={dispatch}
      userHeaders={state.customHeaderNames}
      onCommandWithResult={dispatchWithResult}
    />
  ) : (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">{t(locale, 'noProfilesYet')}</p>
  );

  // 단일 셸 (ADR 0005) — 두 표면이 같은 레일+사이드바+본문을 쓴다.
  // 차이는 크기(팝업 760×580 고정+본문 스크롤 / 탭 전폭·전고)와 "탭에서 열기"뿐.
  return (
    <LocaleProvider locale={locale}>
      <div
        className={`grid grid-cols-[3rem_14rem_minmax(0,1fr)] ${canvas} ${
          surface === 'tab' ? 'min-h-screen' : 'h-[580px] w-[760px]'
        }`}
      >
        <nav className="flex flex-col items-center gap-1 border-r border-zinc-200 py-3 dark:border-zinc-800">
          {RAIL_ITEMS.map(({ view, Icon, labelKey }) => (
            <Button
              key={view}
              variant="ghost"
              size="sm"
              aria-label={t(locale, labelKey)}
              aria-pressed={railView === view}
              className={railView === view ? 'bg-zinc-100 dark:bg-zinc-800' : ''}
              onClick={() => setRailView(view)}
            >
              <Icon size={16} strokeWidth={1.75} />
            </Button>
          ))}
        </nav>

        <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto border-r border-zinc-200 p-3 dark:border-zinc-800">
          <ProfileSidebar
            profiles={state.profiles}
            selectedId={effectiveSelectedId}
            onSelect={setSelectedId}
            onCreate={createAndSelectProfile}
          />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold">{t(locale, 'appName')}</h1>
            <div className="flex items-center gap-1">
              {surface === 'popup' && (
                <Button variant="ghost" size="sm" aria-label={t(locale, 'openInTab')} onClick={openTabApp}>
                  <ExternalLink size={14} strokeWidth={1.75} />
                  <span className="ml-1.5">{t(locale, 'openInTab')}</span>
                </Button>
              )}
              {pauseButton}
            </div>
          </div>

          {/* 오류·일시정지 배너는 레일 화면과 무관하게 항상 보인다 — 조용한 실패 금지. */}
          {alerts}

          {railView === 'profiles' && (
            <>
              {summary && <StatusSummary summary={summary} />}
              {profileEditor}
              <TransferPanel state={state} onCommand={dispatchWithResult} />
            </>
          )}
          {railView === 'backups' && <BackupPanel onCommand={dispatchWithResult} />}
          {railView === 'preferences' && (
            <PreferencesPanel
              customHeaderNames={state.customHeaderNames}
              onCommand={dispatch}
              incognitoAllowed={incognitoAllowed}
            />
          )}
        </main>
      </div>
    </LocaleProvider>
  );
}
