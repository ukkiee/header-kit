import { isProfileExpired } from './expiry';
import { normalizeImportedProfiles } from './transfer';
import {
  defaultMaterializeDeps,
  hasPlaceholders,
  materializeValue,
  type MaterializeDeps,
} from './placeholder';
import type { Filter, Modification, Profile, StoredState } from './schema';

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
    if (hasPlaceholders(modification.value)) {
      next[modification.id] = materializeValue(modification.value, deps);
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
  if (profile?.active && hasPlaceholders(modification.value)) {
    return {
      ...base,
      materialized: {
        ...base.materialized,
        [modification.id]: materializeValue(modification.value, deps),
      },
    };
  }
  return base;
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

  if (!profile?.active || !previous) return base;

  // 활성 중 템플릿 편집: 그 Modification만 재실체화. Placeholder가 사라지면 정리.
  if (hasPlaceholders(next.value)) {
    const templateChanged = previous.value !== next.value;
    const missing = !(next.id in base.materialized);
    if (templateChanged || missing) {
      return {
        ...base,
        materialized: {
          ...base.materialized,
          [next.id]: materializeValue(next.value, deps),
        },
      };
    }
    return base;
  }
  return { ...base, materialized: withoutKey(base.materialized, next.id) };
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

export function addCustomHeaderName(state: StoredState, name: string): StoredState {
  const trimmed = name.trim();
  if (trimmed === '' || state.customHeaderNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
    return state;
  }
  return { ...state, customHeaderNames: [...state.customHeaderNames, trimmed] };
}

export function removeCustomHeaderName(state: StoredState, name: string): StoredState {
  return {
    ...state,
    customHeaderNames: state.customHeaderNames.filter((n) => n !== name),
  };
}

/**
 * 만료된 Time Filter를 가진 활성 Profile을 비활성으로 전환한다.
 * 반드시 toggleProfile을 경유한다 — 활성→비활성 전이의 부수 규칙
 * (이슈 07의 실체화 정리 등)이 만료 경로에서도 동일하게 적용되도록.
 */
export function expireProfiles(
  state: StoredState,
  now: number,
  deps: MaterializeDeps = defaultMaterializeDeps,
): StoredState {
  return state.profiles
    .filter((profile) => isProfileExpired(profile, now))
    .reduce((acc, profile) => toggleProfile(acc, profile.id, false, deps), state);
}

export function addFilter(state: StoredState, profileId: string, filter: Filter): StoredState {
  return withProfile(state, profileId, (profile) => ({
    ...profile,
    filters: [...profile.filters, filter],
  }));
}

export function updateFilter(state: StoredState, profileId: string, next: Filter): StoredState {
  return withProfile(state, profileId, (profile) => ({
    ...profile,
    filters: profile.filters.map((f) => (f.id === next.id ? next : f)),
  }));
}

export function removeFilter(
  state: StoredState,
  profileId: string,
  filterId: string,
): StoredState {
  return withProfile(state, profileId, (profile) => ({
    ...profile,
    filters: profile.filters.filter((f) => f.id !== filterId),
  }));
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
  | { type: 'expire-profiles'; now: number }
  | { type: 'add-custom-header-name'; name: string }
  | { type: 'remove-custom-header-name'; name: string }
  | { type: 'add-modification'; profileId: string; modification: Modification }
  | { type: 'update-modification'; profileId: string; modification: Modification }
  | { type: 'remove-modification'; profileId: string; modificationId: string }
  | { type: 'import-profiles'; profiles: Profile[] }
  | { type: 'restore-profiles'; profiles: Profile[] }
  | { type: 'add-filter'; profileId: string; filter: Filter }
  | { type: 'update-filter'; profileId: string; filter: Filter }
  | { type: 'remove-filter'; profileId: string; filterId: string };

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
    case 'expire-profiles':
      return expireProfiles(state, command.now, deps);
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
    case 'add-filter':
      return addFilter(state, command.profileId, command.filter);
    case 'update-filter':
      return updateFilter(state, command.profileId, command.filter);
    case 'remove-filter':
      return removeFilter(state, command.profileId, command.filterId);
    default:
      return command satisfies never;
  }
}
