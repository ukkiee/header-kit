import { COMMON_COOKIE_NAMES, STANDARD_HEADERS, USER_AGENT_PRESETS } from './autocomplete';
import { isRuleExpired } from './expiry';
import { normalizeImportedProfiles } from './transfer';
import {
  defaultMaterializeDeps,
  hasPlaceholders,
  materializeValue,
  type MaterializeDeps,
} from './placeholder';
import {
  createDefaultState,
  normalizeConditions,
  placeholderTemplate,
  type Modification,
  type Profile,
  type StoredState,
} from './schema';
import type { Locale } from './i18n';
import type { ThemePreference } from './theme';

/** Modification이 Placeholder를 담은 값을 가지면 그 템플릿, 아니면 null. */
function templateWithPlaceholders(modification: Modification): string | null {
  const template = placeholderTemplate(modification);
  return template !== null && hasPlaceholders(template) ? template : null;
}

/**
 * Profile의 모든 Placeholder Modification을 실체화한 새 구역을 만든다.
 * enabled 여부와 무관하게 전부 실체화한다(스펙의 "enabled 원자 실체화"의 상위집합) —
 * 활성 중 disabled→enabled 전환 시 값이 이미 존재하도록 보장하기 위한 의도적 선택.
 */
function materializeProfile(
  materialized: Record<string, string>,
  profile: Profile,
  deps: MaterializeDeps,
): Record<string, string> {
  const next = { ...materialized };
  for (const modification of profile.modifications) {
    const template = templateWithPlaceholders(modification);
    if (template !== null) {
      next[modification.id] = materializeValue(template, deps);
    }
  }
  return next;
}

function clearProfileMaterialization(
  materialized: Record<string, string>,
  profile: Profile,
): Record<string, string> {
  const next = { ...materialized };
  for (const modification of profile.modifications) {
    delete next[modification.id];
  }
  return next;
}

function withoutKey(
  record: Record<string, string>,
  key: string,
): Record<string, string> {
  if (!(key in record)) return record;
  const { [key]: _removed, ...rest } = record;
  return rest;
}

export interface ProfileMeta {
  name: string;
  shortLabel: string;
  color: string;
}

/**
 * 저장 상태의 모든 전이는 이 명령들을 거친다 — UI·Import·Restore가 각자
 * StoredState를 조립하지 않는다. 활성화 경계 불변식(Placeholder 실체화,
 * 비활성화 정리)은 후속 슬라이스에서 이 모듈 한 곳에 꽂힌다.
 */

function withProfile(
  state: StoredState,
  profileId: string,
  update: (profile: Profile) => Profile,
): StoredState {
  return {
    ...state,
    profiles: state.profiles.map((p) => (p.id === profileId ? update(p) : p)),
  };
}

export function toggleProfile(
  state: StoredState,
  profileId: string,
  active: boolean,
  deps: MaterializeDeps = defaultMaterializeDeps,
): StoredState {
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile || profile.active === active) return state;

  // 활성화 경계 (PRD 불변식): 비활성→활성은 모든 Placeholder를 원자적으로
  // 실체화하고, 활성→비활성은 실체화 값을 삭제한다.
  const base = withProfile(state, profileId, (p) => ({ ...p, active }));
  return {
    ...base,
    materialized: active
      ? materializeProfile(base.materialized, profile, deps)
      : clearProfileMaterialization(base.materialized, profile),
  };
}

/**
 * 제안 이력에 값 하나를 더한다 — 세 목록이 함께 쓰는 규칙.
 *
 * 빈 값·이미 있는 값(대소문자 무시)·프리셋에 있는 값은 담지 않는다. 프리셋 중복을 거르는
 * 이유는 목록에 같은 이름이 두 번 서기 때문이다(환경설정의 쌍둥이 pill — ui-refine 03).
 *
 * **상한을 두지 않는다.** 자동으로 쌓이는 쿠키·UA 이력에 상한을 뒀다가 걷었다: 티켓이
 * 요구한 것은 "직접 친 값은 다음에도 제안된다"이고, 상한은 그것을 21번째부터 조용히 어긴다.
 * 목록이 자라는 것이 문제가 되면 그건 지우는 화면을 주는 결정이지 값을 몰래 버리는 결정이 아니다.
 */
function remember(
  history: readonly string[],
  preset: readonly string[],
  value: string,
): string[] {
  const trimmed = value.trim();
  if (trimmed === '') return [...history];
  const lower = trimmed.toLowerCase();
  const known = (list: readonly string[]) => list.some((n) => n.toLowerCase() === lower);
  if (known(history) || known(preset)) return [...history];
  return [...history, trimmed];
}

/**
 * 규칙이 담은 값을 **다음 제안에 남긴다** (티켓 08) — 규칙 저장과 같은 전이 안에서.
 *
 * 명령을 하나 더 보내지 않는 이유가 이것이다: 두 번의 쓰기가 되면 그 사이에 워커가 죽었을 때
 * 규칙은 저장됐는데 이력은 빈 상태가 남는다. 한 전이면 그 창이 없다.
 *
 * **저장이 실제로 일어났을 때만 부른다.** 반대 방향의 어긋남도 똑같이 나쁘다: 없는 프로필에
 * 더하거나 없는 규칙을 고치는 명령은 상태를 바꾸지 않는데, 그때도 남기면 저장된 적 없는 값이
 * 제안에 뜬다. 화면 둘이 열린 채 한쪽이 지운 규칙을 다른 쪽이 저장하면 실제로 도달한다.
 *
 * 헤더 이름은 여기 들어오지 않는다 — 환경설정에서 사람이 등록하고 지우는 목록이라 저장이
 * 몰래 늘리면 그 화면이 자기가 만들지 않은 항목을 들게 된다. 복원·가져오기도 마찬가지다:
 * 복원은 이미 남긴 값이고, 가져오기는 남의 파일에 있던 값이라 내 제안 목록에 섞일 이유가 없다.
 */
function withRememberedValues(state: StoredState, modification: Modification): StoredState {
  if (modification.kind === 'cookie' || modification.kind === 'set-cookie') {
    const name = modification.name ?? '';
    return { ...state, customCookieNames: remember(state.customCookieNames, COMMON_COOKIE_NAMES, name) };
  }
  if (modification.kind === 'user-agent') {
    return {
      ...state,
      customUserAgents: remember(
        state.customUserAgents,
        USER_AGENT_PRESETS.map((preset) => preset.value),
        modification.value,
      ),
    };
  }
  return state;
}

export function addModification(
  state: StoredState,
  profileId: string,
  modification: Modification,
  deps: MaterializeDeps = defaultMaterializeDeps,
): StoredState {
  const profile = state.profiles.find((p) => p.id === profileId);
  const base = withProfile(state, profileId, (p) => ({
    ...p,
    modifications: [...p.modifications, modification],
  }));

  // 활성 Profile에 들어오는 Placeholder는 불변식 유지를 위해 즉시 실체화한다.
  const template = templateWithPlaceholders(modification);
  // 없는 프로필이면 `withProfile`이 무동작이라 규칙이 들어가지 않았다 — 이력도 남기지 않는다.
  const withHistory = profile ? withRememberedValues(base, modification) : base;
  if (profile?.active && template !== null) {
    return {
      ...withHistory,
      materialized: {
        ...withHistory.materialized,
        [modification.id]: materializeValue(template, deps),
      },
    };
  }
  return withHistory;
}

export function updateModification(
  state: StoredState,
  profileId: string,
  next: Modification,
  deps: MaterializeDeps = defaultMaterializeDeps,
): StoredState {
  const profile = state.profiles.find((p) => p.id === profileId);
  const previous = profile?.modifications.find((m) => m.id === next.id);
  const base = withProfile(state, profileId, (p) => ({
    ...p,
    modifications: p.modifications.map((m) => (m.id === next.id ? next : m)),
  }));

  // 고칠 규칙이 없으면 아무것도 바뀌지 않았다 — 그때 이력만 자라면 저장된 적 없는 값이 뜬다.
  const withHistory = previous ? withRememberedValues(base, next) : base;
  if (!profile?.active || !previous) return withHistory;

  // 활성 중 템플릿 편집: 그 Modification만 재실체화. Placeholder가 사라지면 정리.
  const nextTemplate = templateWithPlaceholders(next);
  if (nextTemplate !== null) {
    const prevTemplate = placeholderTemplate(previous);
    const templateChanged = prevTemplate !== nextTemplate;
    const missing = !(next.id in withHistory.materialized);
    if (templateChanged || missing) {
      return {
        ...withHistory,
        materialized: {
          ...withHistory.materialized,
          [next.id]: materializeValue(nextTemplate, deps),
        },
      };
    }
    return withHistory;
  }
  return { ...withHistory, materialized: withoutKey(withHistory.materialized, next.id) };
}

export function removeModification(
  state: StoredState,
  profileId: string,
  modificationId: string,
): StoredState {
  const base = withProfile(state, profileId, (profile) => ({
    ...profile,
    modifications: profile.modifications.filter((m) => m.id !== modificationId),
  }));
  return { ...base, materialized: withoutKey(base.materialized, modificationId) };
}

/**
 * 삭제 실행 취소 (ui-refine 07) — 스냅샷 {원본 Modification, 삭제 시점 인덱스, 해당
 * materialized 값}을 원자적으로 되돌린다. 일반 추가 경로를 타지 않으므로 Placeholder
 * 규칙도 재실체화되지 않고 삭제 전과 동일한 실체화 값으로 돌아온다. materializedValue가
 * 있으면 그 값을 그대로 복원한다(삭제 당시 활성이었다는 뜻).
 *
 * 인덱스는 삭제 시점 목록 기준이다. 되돌리기 전에 목록이 바뀌면(다른 규칙 추가, 또는
 * 여러 삭제를 원래 순서와 다르게 되돌림) 정확한 원위치가 아닐 수 있어 범위로 클램프한다 —
 * 토스트 수명이 짧아 실무상 단일 삭제→즉시 되돌리기가 압도적이며 그 경로는 정확하다.
 */
export function restoreModification(
  state: StoredState,
  profileId: string,
  index: number,
  modification: Modification,
  materializedValue?: string,
): StoredState {
  // 대상 프로필이 사라졌으면(삭제 후 그 프로필까지 삭제됐다면) 아무것도 하지 않는다 —
  // 규칙을 못 넣으면서 materialized만 쓰면 도달 불가능한 값이 영구히 남는다(원자성 위반).
  if (!state.profiles.some((p) => p.id === profileId)) return state;
  const base = withProfile(state, profileId, (profile) => {
    const modifications = [...profile.modifications];
    modifications.splice(Math.max(0, Math.min(index, modifications.length)), 0, modification);
    return { ...profile, modifications };
  });
  if (materializedValue === undefined) return base;
  return {
    ...base,
    materialized: { ...base.materialized, [modification.id]: materializedValue },
  };
}

export function addProfile(
  state: StoredState,
  profile: Profile,
  afterProfileId?: string,
  deps: MaterializeDeps = defaultMaterializeDeps,
): StoredState {
  const index = afterProfileId
    ? state.profiles.findIndex((p) => p.id === afterProfileId)
    : -1;
  const profiles = [...state.profiles];
  profiles.splice(index === -1 ? profiles.length : index + 1, 0, profile);
  const base = { ...state, profiles };

  // 활성 상태로 들어오는 Profile(Import·복원 경로)은 활성화 경계다 —
  // 규칙이 적용되기 전에 모든 Placeholder를 원자적으로 실체화한다.
  if (profile.active) {
    return { ...base, materialized: materializeProfile(base.materialized, profile, deps) };
  }
  return base;
}

export function removeProfile(state: StoredState, profileId: string): StoredState {
  const profile = state.profiles.find((p) => p.id === profileId);
  const base = { ...state, profiles: state.profiles.filter((p) => p.id !== profileId) };
  return profile
    ? { ...base, materialized: clearProfileMaterialization(base.materialized, profile) }
    : base;
}

export function moveProfile(
  state: StoredState,
  profileId: string,
  toIndex: number,
): StoredState {
  const from = state.profiles.findIndex((p) => p.id === profileId);
  if (from === -1) return state;
  const profiles = [...state.profiles];
  const [moved] = profiles.splice(from, 1);
  profiles.splice(Math.max(0, Math.min(toIndex, profiles.length)), 0, moved!);
  return { ...state, profiles };
}

export function duplicateProfile(state: StoredState, profileId: string): StoredState {
  const source = state.profiles.find((p) => p.id === profileId);
  if (!source) return state;
  const copy: Profile = {
    ...source,
    id: crypto.randomUUID(),
    name: `${source.name} copy`,
    active: false,
    modifications: source.modifications.map((m) => ({ ...m, id: crypto.randomUUID() })),
  };
  return addProfile(state, copy, profileId);
}

export function updateProfileMeta(
  state: StoredState,
  profileId: string,
  meta: ProfileMeta,
): StoredState {
  // shortLabel 1–2자 불변식은 UI가 아니라 여기(권위 실행 경로)서 강제한다.
  const normalized = { ...meta, shortLabel: meta.shortLabel.slice(0, 2) };
  return withProfile(state, profileId, (profile) => ({ ...profile, ...normalized }));
}

export function setPaused(state: StoredState, paused: boolean): StoredState {
  return { ...state, paused };
}

/** 권위 상태 기준으로 Pause를 뒤집는다 — 단축키 연타의 lost-update를 막는다. */
export function togglePause(state: StoredState): StoredState {
  return { ...state, paused: !state.paused };
}

/** 명암 선호를 바꾼다 (ADR 0015) — 해석은 UI가 하고, 여기 남는 것은 선호값뿐이다. */
export function setTheme(state: StoredState, theme: ThemePreference): StoredState {
  return { ...state, theme };
}

/**
 * 화면 언어를 고른다 (티켓 09) — 고르는 순간부터 브라우저 UI 언어 대신 이 값이 쓰인다.
 *
 * 되돌릴 값이 필요하면 다른 언어를 고르면 된다. '브라우저를 따름'으로 되돌아가는 경로를
 * 선택지로 두지 않은 것은 스펙이 정한 선택지가 ko/en 둘뿐이기 때문이다.
 */
export function setLocale(state: StoredState, locale: Locale): StoredState {
  return { ...state, locale };
}

/**
 * 툴바 배지를 보일지 정한다 (티켓 06) — **표시 여부만** 바꾼다.
 *
 * 규칙 적용은 이 값과 무관하다. 배지를 끄는 것과 규칙을 멈추는 것(Pause)은 다른 조작이고,
 * 여기서 규칙까지 건드리면 "아이콘을 깔끔하게 두려던" 사용자가 규칙을 잃는다.
 */
export function setBadgeVisible(state: StoredState, visible: boolean): StoredState {
  return { ...state, badgeVisible: visible };
}

/**
 * 백업을 클라우드에 둘지 정한다 (티켓 07, R-1) — **앞으로의** 저장 위치만 바꾼다.
 *
 * 이미 만들어진 스냅샷은 만들어진 저장소에 그대로 남는다. 여기서 이관까지 하면 커밋-후
 * 삭제 실패·자동 백업과의 경쟁 같은 트랜잭션 문제가 따라 들어오고, 그것들은 v0.1.0이
 * 감당할 이유가 없다. 클라우드 잔재를 지우는 것은 별도의 명시적 동작이다.
 */
export function setSyncBackup(state: StoredState, enabled: boolean): StoredState {
  return { ...state, syncBackup: enabled };
}

/**
 * 전체 초기화의 상태 부분 (티켓 08, R-3) — 이전 상태를 **보지 않는다**.
 *
 * 프로필·선호값·실체화 값·사용자 헤더 이름이 전부 기본값으로 돌아간다. 남길 것을 고르는
 * 순간 "무엇이 남았는지"를 화면과 저장소가 서로 다르게 알게 되고, 그것이 초기화가 없애려던
 * 상태다. 저장소(백업 스냅샷·세션 요약) 삭제는 순수 전이가 아니라 core/reset이 조율한다.
 */
export function resetToDefaults(): StoredState {
  return createDefaultState();
}

export function addCustomHeaderName(state: StoredState, name: string): StoredState {
  // 쿠키·UA 이력과 **같은 규칙**을 쓴다 — 빈 값·중복·프리셋 중복을 거르는 네 단계가 한 곳이다.
  const customHeaderNames = remember(state.customHeaderNames, STANDARD_HEADERS, name);
  return customHeaderNames.length === state.customHeaderNames.length
    ? state
    : { ...state, customHeaderNames };
}

export function removeCustomHeaderName(state: StoredState, name: string): StoredState {
  return {
    ...state,
    customHeaderNames: state.customHeaderNames.filter((n) => n !== name),
  };
}

/**
 * 퇴역 공지를 확인해 지운다 (티켓 02, ADR 0017) — **보는 것으로는 지워지지 않는다**.
 *
 * 확인이 명령인 이유는 그래야 단일 writer의 쓰기 문을 지나기 때문이다. 화면이 자기 사본에서
 * 지우면 그 지움은 저장소에 닿지 못해 팝업이 닫히는 순간 되돌아오고, 반대로 렌더가 소비하면
 * 팝업이 렌더 직후 닫히는 정상 동작만으로 공지가 사라진다 — 규칙은 이미 넓어졌는데 그 이유를
 * 설명하던 유일한 것이 없어진 상태다. 쓰기가 실패하면 상태가 그대로이므로 공지도 그대로다.
 *
 * 값을 0으로 두지 않고 **필드를 지운다**: 부재가 곧 "알릴 것이 없다"라는 것이 이 필드의 계약이다.
 */
export function acknowledgeRetirement(state: StoredState): StoredState {
  if (state.retirementNotice === undefined) return state;
  const { retirementNotice: _acknowledged, ...rest } = state;
  return rest;
}

/**
 * 만료된 규칙을 끄고 expiresAt을 소비한다 (ADR 0010) — 알람은 일회성이다.
 * 규칙만 꺼지고 프로필은 그대로다.
 */
export function expireRules(state: StoredState, now: number): StoredState {
  return {
    ...state,
    profiles: state.profiles.map((profile) => {
      if (!profile.active || !profile.modifications.some((m) => isRuleExpired(m, now))) {
        return profile;
      }
      return {
        ...profile,
        modifications: profile.modifications.map((m) => {
          if (!isRuleExpired(m, now)) return m;
          const conditions = normalizeConditions({ ...m.conditions, expiresAt: undefined });
          const next = { ...m, enabled: false } as typeof m;
          if (conditions) return { ...next, conditions };
          const { conditions: _empty, ...bare } = next;
          return bare as typeof m;
        }),
      };
    }),
  };
}

/**
 * UI·Import·Restore가 background(단일 writer)로 보내는 직렬화 가능한 명령.
 * 전이 로직은 위의 순수 함수들이고, 이 union은 그 메시지 표현이다.
 */
export type Command =
  | { type: 'toggle-profile'; profileId: string; active: boolean }
  | { type: 'add-profile'; profile: Profile; afterProfileId?: string }
  | { type: 'duplicate-profile'; profileId: string }
  | { type: 'remove-profile'; profileId: string }
  | { type: 'move-profile'; profileId: string; toIndex: number }
  | { type: 'update-profile-meta'; profileId: string; meta: ProfileMeta }
  | { type: 'set-paused'; paused: boolean }
  | { type: 'toggle-pause' }
  | { type: 'set-theme'; theme: ThemePreference }
  | { type: 'set-locale'; locale: Locale }
  | { type: 'set-badge-visible'; visible: boolean }
  | { type: 'set-sync-backup'; enabled: boolean }
  /** 전체 초기화의 상태 부분 — 저장소 삭제·자동 백업 중단은 런타임이 이 명령 주변에서 조율한다. */
  | { type: 'full-reset' }
  | { type: 'expire-rules'; now: number }
  /** 퇴역 공지 확인 — 쓰기 문을 지나 성공했을 때만 공지가 사라진다 (티켓 02). */
  | { type: 'acknowledge-retirement' }
  | { type: 'add-custom-header-name'; name: string }
  | { type: 'remove-custom-header-name'; name: string }
  | { type: 'add-modification'; profileId: string; modification: Modification }
  | { type: 'update-modification'; profileId: string; modification: Modification }
  | { type: 'remove-modification'; profileId: string; modificationId: string }
  | {
      type: 'restore-modification';
      profileId: string;
      index: number;
      modification: Modification;
      materializedValue?: string;
    }
  | { type: 'import-profiles'; profiles: Profile[] }
  | { type: 'restore-profiles'; profiles: Profile[] };

/**
 * Import된 Profile들을 끝에 덧붙인다 — 활성 Profile은 활성화 경계로 실체화된다.
 * 페이로드를 신뢰하지 않는다: id 재생성·탭 참조 정리·라벨 불변식은 항상
 * 여기(권위 실행 경로)서 다시 강제된다.
 */
export function importProfiles(
  state: StoredState,
  profiles: Profile[],
  deps: MaterializeDeps = defaultMaterializeDeps,
): StoredState {
  const { profiles: normalized } = normalizeImportedProfiles(profiles, deps.uuid);
  return normalized.reduce((acc, profile) => addProfile(acc, profile, undefined, deps), state);
}

/**
 * Backup 스냅샷으로의 복원 — 현재 Profile 전체를 스냅샷 내용으로 교체한다.
 * Import와 동일한 활성화 경계를 지난다: 정규화(id 재생성·탭 참조 정리) 후
 * 활성 Profile은 원자적으로 실체화된다. Pause 상태는 보존한다.
 */
export function restoreProfiles(
  state: StoredState,
  profiles: Profile[],
  deps: MaterializeDeps = defaultMaterializeDeps,
): StoredState {
  const { profiles: normalized } = normalizeImportedProfiles(profiles, deps.uuid);
  const emptied: StoredState = { ...state, profiles: [], materialized: {} };
  return normalized.reduce((acc, profile) => addProfile(acc, profile, undefined, deps), emptied);
}

export function applyCommand(
  state: StoredState,
  command: Command,
  deps: MaterializeDeps = defaultMaterializeDeps,
): StoredState {
  switch (command.type) {
    case 'toggle-profile':
      return toggleProfile(state, command.profileId, command.active, deps);
    case 'add-profile':
      return addProfile(state, command.profile, command.afterProfileId, deps);
    case 'duplicate-profile':
      return duplicateProfile(state, command.profileId);
    case 'remove-profile':
      return removeProfile(state, command.profileId);
    case 'move-profile':
      return moveProfile(state, command.profileId, command.toIndex);
    case 'update-profile-meta':
      return updateProfileMeta(state, command.profileId, command.meta);
    case 'set-paused':
      return setPaused(state, command.paused);
    case 'toggle-pause':
      return togglePause(state);
    case 'set-theme':
      return setTheme(state, command.theme);
    case 'set-locale':
      return setLocale(state, command.locale);
    case 'set-badge-visible':
      return setBadgeVisible(state, command.visible);
    case 'set-sync-backup':
      return setSyncBackup(state, command.enabled);
    case 'full-reset':
      return resetToDefaults();
    case 'expire-rules':
      return expireRules(state, command.now);
    case 'acknowledge-retirement':
      return acknowledgeRetirement(state);
    case 'add-custom-header-name':
      return addCustomHeaderName(state, command.name);
    case 'remove-custom-header-name':
      return removeCustomHeaderName(state, command.name);
    case 'import-profiles':
      return importProfiles(state, command.profiles, deps);
    case 'restore-profiles':
      return restoreProfiles(state, command.profiles, deps);
    case 'add-modification':
      return addModification(state, command.profileId, command.modification, deps);
    case 'update-modification':
      return updateModification(state, command.profileId, command.modification, deps);
    case 'remove-modification':
      return removeModification(state, command.profileId, command.modificationId);
    case 'restore-modification':
      return restoreModification(
        state,
        command.profileId,
        command.index,
        command.modification,
        command.materializedValue,
      );
    default:
      return command satisfies never;
  }
}
