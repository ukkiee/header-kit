import { useEffect, useState } from 'react';
import { IconButton, IconTooltipProvider } from '@/ui/icon-button';
import { MotionProvider } from '@/ui/motion-provider';
import { MotionView } from '@/ui/motion-view';
import { useToastManager } from '@/ui/toast';
import { BackupPanel } from '@/features/backup/backup-panel';
import { PreferencesPanel } from '@/features/preferences/preferences-panel';
import { ProfileSection } from '@/features/profiles/profile-section';
import { ProfileSidebar } from '@/features/profiles/profile-sidebar';
import { reconcileSelection } from '@/features/profiles/selection';
import { StatusSummary } from '@/features/status/status-summary';
import { TransferPanel } from '@/features/transfer/transfer-panel';
import { AlertBanner } from '@/ui/alert-banner';
import { Button } from '@/ui/press-button';
import { LocaleProvider } from '@/ui/i18n-context';
import { ScrollArea } from '@/ui/scroll-area';
import type { Command } from '@/core/commands';
import { format, pickLocale, pickLocalePreference, t, type MessageKey } from '@/core/i18n';
import { createProfile, PROFILE_COLORS, type Profile, type StoredState } from '@/core/schema';
import { DEFAULT_THEME } from '@/core/theme';
import { useAppliedTheme } from '@/ui/use-theme';
import type { StatusSummary as StatusSummaryData } from '@/core/summary';
import { canvas } from '@/ui/tokens';
import { statusCountsText } from '@/features/status/status-text';
import { loadRuleForm, ruleFormIntentProps } from '@/features/modifications/lazy-rule-form';
import { ExternalLink, History, Layers, Pause, Play, Plus, Settings } from 'lucide-react';
import { getSummary, loadState, onStateChanged, onSummaryChanged, sendCommand } from '@/platform/stateStore';

/** 두 표면은 단일 셸(ADR 0005) — 차이는 크기와 '탭에서 열기' 버튼뿐. */
export type AppSurface = 'popup' | 'tab';

/** 레일 화면 — 관리 기능(백업/환경설정)이 본문 편집과 분리된다 (ADR 0005). */
type RailView = 'profiles' | 'backups' | 'preferences';

/*
 * 레일 항목 — 접근성 이름(`labelKey`)과 **보이는 라벨**(`textKey`)을 따로 든다 (티켓 10).
 * 보이는 라벨은 레일 폭 안에 들어가는 화면 이름(프로필/백업/설정)이고, 접근성 이름은
 * 그 버튼이 하는 일("프로필 화면"으로 이동)을 그대로 말한다.
 */
const RAIL_ITEMS: Array<{
  view: RailView;
  Icon: typeof Layers;
  labelKey: MessageKey;
  textKey: MessageKey;
}> = [
  { view: 'profiles', Icon: Layers, labelKey: 'ariaShowProfiles', textKey: 'railProfiles' },
  { view: 'backups', Icon: History, labelKey: 'ariaShowBackups', textKey: 'railBackups' },
  { view: 'preferences', Icon: Settings, labelKey: 'ariaShowPreferences', textKey: 'railSettings' },
];

export function App({ surface = 'popup' }: { surface?: AppSurface }) {
  const [state, setState] = useState<StoredState | null>(null);
  // 단일 프로필 뷰(ADR 0004)의 선택 — 렌더마다 reconcileSelection으로 재조정된다.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [railView, setRailView] = useState<RailView>('profiles');
  /*
   * 규칙 폼의 열림 상태가 여기 있는 이유는 여는 버튼이 **본문 헤더**에 있기 때문이다
   * (ADR 0017). 목록 쪽에 두면 헤더 버튼이 목록 안으로 손을 뻗어야 한다.
   * 'new' = 생성, id = 그 규칙 편집, null = 목록만 (ADR 0006).
   */
  const [editingRule, setEditingRule] = useState<'new' | string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  /** 로드가 멈춘 사유 (R-3) — 읽을 수 없는 상태를 빈 화면으로 그리지 않기 위해 따로 든다. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<StatusSummaryData | null>(null);
  /*
   * 언어의 두 **바깥** 출처 (티켓 09). 저장된 선호는 state가 들고 있으므로 여기 두지 않는다 —
   * 복사본을 두면 설정에서 언어를 바꾼 뒤 그 복사본이 낡아 화면이 옛 언어로 남는다.
   * 우선순위 판단은 pickLocale 한 곳이 한다.
   */
  const [localeSources, setLocaleSources] = useState<{ override: string | null; uiLanguage: string }>({
    override: null,
    uiLanguage: 'en',
  });
  const [incognitoAllowed, setIncognitoAllowed] = useState<boolean | null>(null);
  /*
   * 명암 적용 (ADR 0015). 상태가 아직 없는 동안(로드 전)은 'system'으로 둔다 — 그 순간의
   * 화면은 어차피 비어 있고, 저장된 선호를 모르는 채 특정 테마를 고르면 로드 후 반대로
   * 뒤집히는 깜빡임이 생긴다.
   */
  useAppliedTheme(state?.theme ?? DEFAULT_THEME);

  useEffect(() => {
    // 요약은 background가 적용한 결과를 발행한 것을 읽기만 한다 (독립 재컴파일 없음).
    const refresh = () =>
      void loadState().then(setState, (error: unknown) =>
        setLoadError(error instanceof Error ? error.message : String(error)),
      );
    refresh();
    void getSummary().then(setSummary);
    onStateChanged(refresh);
    onSummaryChanged(() => void getSummary().then(setSummary));
    // URL의 ?locale= 오버라이드(언어 강제)와 브라우저 UI 언어는 한 번만 읽으면 되는 값이다.
    setLocaleSources({
      override: new URLSearchParams(window.location.search).get('locale'),
      uiLanguage: browser.i18n.getUILanguage(),
    });
    void browser.extension.isAllowedIncognitoAccess().then(setIncognitoAllowed);
  }, []);

  const toast = useToastManager();

  if (!state)
    return loadError ? (
      <AlertBanner severity="danger" role="alert">
        {loadError}
      </AlertBanner>
    ) : null;

  const locale = pickLocale(localeSources.override, state.locale, localeSources.uiLanguage);
  // 화면이 쓰는 언어와 **언어 칩이 짚는 값**은 다른 질문이다 — 칩은 오버라이드를 보지 않는다.
  const localePreference = pickLocalePreference(state.locale, localeSources.uiLanguage);
  const effectiveSelectedId = reconcileSelection(selectedId, state.profiles);
  // 재조정 결과를 상태로 커밋(렌더 중 상태 조정 패턴) — 자동 선택·폴백이 고정되어,
  // 활성 토글로 뷰가 점프하거나 옛 ID 재도입 시 선택이 되돌아가지 않는다.
  if (effectiveSelectedId !== selectedId) setSelectedId(effectiveSelectedId);
  const selectedIndex = state.profiles.findIndex((p) => p.id === effectiveSelectedId);
  const selectedProfile = selectedIndex >= 0 ? state.profiles[selectedIndex] : undefined;

  /*
   * 명령 보내기 — **약속을 돌려준다.** 대부분의 호출부는 그것을 버리지만, 드래그 재정렬은
   * "명령이 착지했는가"를 알아야 낙관적 순서를 언제 버릴지 정할 수 있다.
   *
   * 거부(`ok: false`)뿐 아니라 **던진 것도** 배너로 잡는다. 배경 왕복은 워커 teardown·확장
   * 리로드에서 던지는데, 예전에는 그 경로가 `void`로 흘러가 아무 말도 없이 사라졌다 —
   * 화면은 아무 일도 안 일어난 것처럼 보이고 사용자는 다시 누른다.
   */
  const dispatch = (command: Command): Promise<void> =>
    sendCommand(command).then(
      (result) => {
        if (result.ok) {
          setState(result.state);
          setCommandError(null);
        } else {
          setCommandError(result.error);
        }
      },
      (error: unknown) => {
        setCommandError(error instanceof Error ? error.message : String(error));
      },
    );

  // TransferPanel은 결과를 직접 받아 자기 자리에서 오류를 보여준다 (전역 배너 미사용).
  const dispatchWithResult = async (command: Command): Promise<{ ok: boolean; error?: string }> => {
    const result = await sendCommand(command);
    if (result.ok) {
      setState(result.state);
      return { ok: true };
    }
    return { ok: false, error: result.error };
  };

  /**
   * 백업 복원 — **바로 실행하고 되돌리기를 토스트로 준다** (규칙 삭제와 같은 결).
   *
   * 되돌릴 스냅샷은 복원 **직전의** 프로필 전체다. 그것을 쥔 것은 셸이라 이 함수가 여기 있다 —
   * 백업 패널은 스냅샷을 읽고 풀어 주기만 하고, 명령과 되돌리기는 이쪽이 든다.
   *
   * **되돌린 것이 원본과 완전히 같지는 않다.** `restore-profiles`는 권위 경로라 id를 다시
   * 매기고 Placeholder를 다시 실체화한다 — 이름·색·규칙은 그대로지만 `{{uuid}}` 값은 새로
   * 뽑힌다. 규칙 삭제의 실행 취소가 실체화 값까지 그대로 되살리는 것과 다른 점이고
   * (그쪽은 전용 명령이 있다), 프로필 전체를 그렇게 되살리는 명령은 두지 않았다.
   */
  const restoreWithUndo = async (profiles: Profile[]) => {
    const previous = state.profiles;
    const result = await dispatchWithResult({ type: 'restore-profiles', profiles });
    if (!result.ok) return result;
    const toastId = toast.add({
      title: t(locale, 'profilesRestored'),
      data: { actionLabel: t(locale, 'undo') },
      actionProps: {
        onClick: () => {
          void dispatchWithResult({ type: 'restore-profiles', profiles: [...previous] });
          toast.close(toastId);
        },
      },
    });
    return result;
  };

  const openTabApp = () => {
    void browser.tabs.create({ url: browser.runtime.getURL('/app.html') });
  };

  // 규칙 삭제 + 실행 취소 (ui-refine 07) — 삭제 시점에 {원본, 인덱스, materialized 값}을
  // 스냅샷하고, Undo는 restore-modification 하나로 원자 복원한다(재실체화 없음).
  const deleteRuleWithUndo = (profileId: string, modificationId: string) => {
    const profile = state.profiles.find((p) => p.id === profileId);
    const index = profile?.modifications.findIndex((m) => m.id === modificationId) ?? -1;
    const modification = index >= 0 ? profile!.modifications[index] : undefined;
    if (!modification) return;
    const materializedValue = state.materialized[modificationId];
    void dispatch({ type: 'remove-modification', profileId, modificationId });
    const toastId = toast.add({
      title: t(locale, 'ruleDeleted'),
      data: { actionLabel: t(locale, 'undo') },
      actionProps: {
        onClick: () => {
          void dispatch({ type: 'restore-modification', profileId, index, modification, materializedValue });
          toast.close(toastId); // 되돌렸으면 토스트도 닫는다
        },
      },
    });
  };

  /**
   * 프로필 선택 (ADR 0017).
   *
   * 화면을 함께 옮기던 보정이 사라졌다. 그 보정은 사이드바가 레일 화면과 무관하게 늘 보이던
   * 시절(ADR 0005) "백업을 보는 중에 프로필을 눌러도 아무 일이 안 일어난 것처럼 보인다"를
   * 막으려던 것인데, 이제 프로필 열이 프로필 화면에서만 서므로 **누를 것 자체가 없다**.
   *
   * 편집 중이던 폼은 닫는다 — 다른 프로필의 규칙을 고치던 폼이 그대로 열려 있으면 지금 보는
   * 목록에 없는 규칙을 편집하게 된다.
   */
  const selectProfile = (id: string) => {
    setSelectedId(id);
    setEditingRule(null);
  };

  /** 폼으로 가는 문 — 여는 즉시 청크를 부른다(트리거의 hover가 이미 시작했으면 같은 약속). */
  const openRuleForm = (target: 'new' | string) => {
    void loadRuleForm();
    setEditingRule(target);
  };

  const createAndSelectProfile = () => {
    // 이름은 카탈로그를 거친다 (티켓 04) — 이름 변경 컨트롤이 없어져 이 이름이 끝까지 남는다.
    const profile = createProfile(
      format(t(locale, 'newProfileName'), { number: state.profiles.length + 1 }),
      {
        color: PROFILE_COLORS[state.profiles.length % PROFILE_COLORS.length],
      },
    );
    // 선택은 커맨드 성공 후 확정 — 낙관적 선택은 커밋-중-렌더 재조정이 되돌린다.
    void sendCommand({ type: 'add-profile', profile }).then((result) => {
      if (result.ok) {
        setState(result.state);
        // 새 프로필도 같은 이유로 화면을 옮긴다 — 만들어 놓고 안 보이면 만든 줄 모른다.
        selectProfile(profile.id);
        setCommandError(null);
      } else {
        setCommandError(result.error);
      }
    });
  };

  /*
   * 일시정지·재개 — **아이콘만** 남긴다. 헤더 오른쪽에 이미 '탭에서 열기'(아이콘)와
   * '규칙 추가'(글자)가 서 있어 셋이 나란히 놓이면 줄이 붐빈다.
   *
   * 글자를 지우면서 `Button`이 아니라 **`IconButton`으로 갈아탄다.** 글자 없는 버튼을
   * 툴팁 없이 두는 것이 이 저장소가 티켓 하나를 써서 없앤 결함이고(ui-polish 10, 레일),
   * 옆의 '탭에서 열기'도 이미 이 셸이다. 접근성 이름은 같은 카탈로그 키에서 나오므로
   * 이름으로 이 버튼을 집는 곳(스모크 14자리)은 그대로다 — 글자가 있던 시절에도 이름은
   * `aria-label`에서 왔지 보이는 글자에서 오지 않았다.
   *
   * 정지 중 강조는 `variant="default"`(채운 파랑) 대신 **눌린 아이콘 버튼**으로 말한다 —
   * 규칙 행의 편집 아이콘이 폼을 연 동안 쓰는 그 표시와 같다(`aria-pressed` + 채운 면).
   * 정지는 그 밖에도 두 곳에서 더 말한다: 전폭 경고 배너와 흐려진 헤더 제목.
   */
  const pauseButton = (
    <IconButton
      label={state.paused ? t(locale, 'resume') : t(locale, 'pause')}
      icon={state.paused ? Play : Pause}
      aria-pressed={state.paused}
      className={state.paused ? 'bg-secondary text-foreground' : ''}
      onClick={() => dispatch({ type: 'set-paused', paused: !state.paused })}
    />
  );

  /*
   * 퇴역 공지 (티켓 02, ADR 0017) — **그리는 것으로 소비하지 않는다.**
   *
   * 여기서 하는 일은 읽어서 보여 주는 것뿐이고, 지우는 것은 확인 버튼이 보내는 명령이다.
   * 렌더에서 소비하면 팝업이 렌더 직후 닫히는 정상 동작만으로 공지가 사라진다 — 규칙은 이미
   * 넓어졌는데 그 이유를 설명하던 유일한 것이 없어진 상태다. 명령이 쓰기 문에서 실패하면
   * 상태가 갱신되지 않으므로(dispatch는 성공했을 때만 setState한다) 공지도 그대로 남는다.
   */
  const retirementNotice = state.retirementNotice;
  const alerts = (
    <>
      {incognitoAllowed === false && (
        <AlertBanner severity="info">{t(locale, 'incognitoBlocked')}</AlertBanner>
      )}
      {retirementNotice && (
        <AlertBanner as="div" severity="warn" className="flex items-center gap-2">
          <span className="min-w-0 flex-1">
            {format(
              t(locale, retirementNotice.rules === 1 ? 'retirementNoticeRule' : 'retirementNoticeRules'),
              { count: retirementNotice.rules },
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => dispatch({ type: 'acknowledge-retirement' })}
          >
            {t(locale, 'acknowledgeRetirement')}
          </Button>
        </AlertBanner>
      )}
      {state.paused && <AlertBanner severity="warn">{t(locale, 'pausedNote')}</AlertBanner>}
      {commandError && (
        <AlertBanner severity="danger" role="alert">
          {commandError}
        </AlertBanner>
      )}
    </>
  );

  const profileEditor = selectedProfile ? (
    <ProfileSection
      key={selectedProfile.id}
      profile={selectedProfile}
      paused={state.paused}
      onCommand={dispatch}
      onDeleteRule={deleteRuleWithUndo}
      history={{
        headerNames: state.customHeaderNames,
        cookieNames: state.customCookieNames,
        userAgents: state.customUserAgents,
      }}
      onCommandWithResult={dispatchWithResult}
      editingRule={editingRule}
      onEditingRuleChange={setEditingRule}
      onOpenRuleForm={openRuleForm}
      onReorderRule={(modificationId, toIndex) =>
        dispatch({ type: 'move-modification', profileId: selectedProfile.id, modificationId, toIndex })
      }
    />
  ) : (
    <p className="text-xs text-muted-foreground">{t(locale, 'noProfilesYet')}</p>
  );

  const showProfileColumn = railView === 'profiles';
  const headerTitle =
    railView === 'profiles'
      ? (selectedProfile?.name ?? t(locale, 'appName'))
      : railView === 'backups'
        ? t(locale, 'railBackups')
        : t(locale, 'railSettings');
  const headerSubtitle =
    railView === 'profiles'
      ? summary && statusCountsText(summary, (key) => t(locale, key))
      : railView === 'backups'
        ? t(locale, 'headerBackupsSub')
        : t(locale, 'headerSettingsSub');

  /*
   * 단일 셸 (ADR 0005) — 두 표면이 같은 레일+본문을 쓴다. 차이는 크기와 '탭에서 열기'뿐.
   *
   * **프로필 열은 프로필 화면에서만 선다** (ADR 0017이 ADR 0005를 개정). 백업·설정에서는
   * 본문이 그 폭을 가져가므로 팝업에서도 히스토리 행이 살 만해진다. 열 폭은 시안 값이다 —
   * 좁아진 레일(68) 덕에 본문에 남는 폭은 오히려 늘었다(408 → 428).
   *
   * 두 표면 모두 **확정 높이**여야 한다. 탭이 min-h-screen이면 행이 내용만큼 늘어나
   * 뷰포트가 넘칠 일이 없고, 스크롤이 ScrollArea가 아니라 문서로 떨어진다 — 탭에서만
   * OS 기본 스크롤바가 뜬다 (structure r1 S-2).
   */
  return (
    <LocaleProvider locale={locale}>
      <MotionProvider>
        <IconTooltipProvider>
          <div
            className={`grid ${canvas} ${surface === 'tab' ? 'h-screen' : 'h-[580px] w-[760px]'} ${
              showProfileColumn ? 'grid-cols-[68px_264px_minmax(0,1fr)]' : 'grid-cols-[68px_minmax(0,1fr)]'
            }`}
          >
            <nav className="flex flex-col gap-1 border-r border-border p-2">
              {/* 레일 아이콘도 다른 아이콘 버튼과 같은 셸을 쓴다 — 툴팁(호버·키보드 포커스)과
              접근성 이름이 같은 카탈로그 키에서 나와 갈라지지 않는다.

              선택 표시는 여전히 **색만이 아니다** — 채워진 면(명도)과 글자 굵기 두 채널이
              함께 선다. 색을 지워도 어느 화면인지 남아야 한다(스펙 story 38). 예전에는 그
              역할을 왼쪽 2px 파란 막대가 맡았는데, 시안에 없는 장식이라 걷었다: 남은 두
              채널이 이미 그레이스케일에서 구별되고 `aria-pressed`가 문자로도 말한다. */}
              {RAIL_ITEMS.map(({ view, Icon, labelKey, textKey }) => (
                <IconButton
                  key={view}
                  size="rail"
                  label={t(locale, labelKey)}
                  text={t(locale, textKey)}
                  icon={Icon}
                  aria-pressed={railView === view}
                  className={railView === view ? 'bg-secondary font-medium' : ''}
                  onClick={() => setRailView(view)}
                />
              ))}
              {/*
            레일 하단 — 지금 실제로 걸려 있는 규칙 수(스펙 story 20). 값의 출처는 background가
            발행한 요약 하나뿐이라(독립 재컴파일 없음) 툴바 배지·헤더 부제와 같은 수를 말한다.
            일시정지면 요약의 규칙 수가 0이므로 여기도 0으로 떨어진다.
          */}
              <p className="mt-auto flex flex-col items-center pt-2 text-xs">
                <strong className="font-mono text-sm font-medium">{summary?.ruleCount ?? 0}</strong>
                <span className="text-muted-foreground">{t(locale, 'railApplied')}</span>
              </p>
            </nav>

            {showProfileColumn && (
              <ScrollArea render={<aside />} className="min-h-0 border-r border-border">
                <div className="flex flex-col gap-2 p-3">
                  <ProfileSidebar
                    profiles={state.profiles}
                    selectedId={effectiveSelectedId}
                    paused={state.paused}
                    onSelect={selectProfile}
                    onCreate={createAndSelectProfile}
                    onReorder={(profileId, toIndex) => dispatch({ type: 'move-profile', profileId, toIndex })}
                    onToggleActive={(profileId, active) =>
                      dispatch({ type: 'toggle-profile', profileId, active })
                    }
                    /*
                프로필 삭제 (ADR 0017 개정) — 되물음은 행이 이미 마쳤다.
                선택은 따로 손대지 않는다: 지운 것이 보고 있던 프로필이면 렌더 중
                재조정(`reconcileSelection`)이 남은 것 중 하나로 옮겨 주고, 하나도 남지
                않으면 본문이 '아직 프로필이 없습니다'로 떨어진다.
              */
                    onDelete={(profileId) => void dispatch({ type: 'remove-profile', profileId })}
                  />
                </div>
              </ScrollArea>
            )}

            {/*
          본문은 **고정 헤더 + 스크롤 몸통**이다 (ADR 0017). 헤더까지 함께 스크롤되면 지금 보는
          프로필 이름과 적용 수가 목록을 내리는 순간 사라진다 — 시안이 그 줄을 고정해 둔 이유다.

          `min-h-0`이 없으면 스크롤이 조용히 죽는다 — 그리드 자식의 기본 min-height는 auto라
          칸보다 작아지지 않고, 그러면 콘텐츠가 팝업 셸 자체를 밀어낸다(760×580 고정이 깨진다).
        */}
            <main className="flex min-h-0 min-w-0 flex-col">
              <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <h1
                    className={`truncate text-base font-semibold tracking-tight ${
                      state.paused ? 'text-muted-foreground' : ''
                    }`}
                  >
                    {headerTitle}
                  </h1>
                  {headerSubtitle && (
                    <p className="truncate text-xs text-muted-foreground">{headerSubtitle}</p>
                  )}
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {surface === 'popup' && (
                    <IconButton label={t(locale, 'openInTab')} icon={ExternalLink} onClick={openTabApp} />
                  )}
                  {pauseButton}
                  {/* 규칙 추가는 프로필 화면의 동작이다 — 백업·설정에는 더할 목록이 없다. */}
                  {/*
                폼이 **열려 있는 동안**은 누를 수 없다 — 편집 중에 누르면 나가는 폼과 들어오는
                폼이 한동안 둘 다 DOM에 있어 같은 접근성 이름의 입력이 둘이 된다.

                닫히는 **중**은 덮지 않는다: 상태는 폼이 사라지기 전에 이미 null이 되고, 퇴장
                애니메이션이 끝날 때까지 버튼은 다시 살아 있다. 예전 하단 버튼은 그 창까지
                `onExitComplete`로 덮었지만, 그건 버튼이 폼 **아래**에 있어 튀어 오르는 것을
                막으려던 것이고 헤더 버튼은 자리가 고정이라 그 문제가 없다. 그 짧은 창에
                의존하는 쪽(스모크)은 폼이 접히기를 명시적으로 기다린다.
              */}
                  {railView === 'profiles' && selectedProfile && (
                    <Button
                      size="sm"
                      disabled={editingRule !== null}
                      {...ruleFormIntentProps}
                      onClick={() => openRuleForm('new')}
                    >
                      <Plus size={14} strokeWidth={1.75} className="mr-1" />
                      {t(locale, 'addRule')}
                    </Button>
                  )}
                </div>
              </header>

              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-3 p-4">
                  {/* 오류·일시정지 배너는 레일 화면과 무관하게 항상 보인다 — 조용한 실패 금지. */}
                  {alerts}

                  <MotionView viewKey={railView}>
                    {railView === 'profiles' && (
                      <>
                        {/* 수는 헤더가 말하므로 여기서는 끈다 — 경고·오류는 그대로 남는다.
                      조용한 실패 금지는 시안에 자리가 없다고 사라지는 계약이 아니다. */}
                        {summary && <StatusSummary summary={summary} showCounts={false} />}
                        {profileEditor}
                      </>
                    )}
                    {/* 백업 화면이 파일 왕복(JSON 내보내기·가져오기)과 스냅샷 히스토리를 함께 갖는다
                  (티켓 09) — 둘 다 "프로필 전체를 어딘가에 두고 되찾는" 같은 일이라, 파일은
                  프로필 화면에 두고 스냅샷만 여기 두면 백업하러 온 사람이 반쪽만 찾는다. */}
                    {railView === 'backups' && (
                      <>
                        <TransferPanel state={state} onCommand={dispatchWithResult} />
                        <BackupPanel
                          syncBackup={state.syncBackup}
                          onCommand={dispatchWithResult}
                          onRestore={restoreWithUndo}
                        />
                      </>
                    )}
                    {railView === 'preferences' && (
                      <PreferencesPanel
                        theme={state.theme}
                        locale={localePreference}
                        badgeVisible={state.badgeVisible}
                        onCommand={dispatch}
                      />
                    )}
                  </MotionView>
                </div>
              </ScrollArea>
            </main>
          </div>
        </IconTooltipProvider>
      </MotionProvider>
    </LocaleProvider>
  );
}
