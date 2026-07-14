import type { Modification, Profile, StoredState } from './schema';

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
): StoredState {
  // 비활성→활성 전환은 활성화 경계다: Placeholder 실체화가 이후 여기서 일어난다.
  return withProfile(state, profileId, (profile) => ({ ...profile, active }));
}

export function addModification(
  state: StoredState,
  profileId: string,
  modification: Modification,
): StoredState {
  return withProfile(state, profileId, (profile) => ({
    ...profile,
    modifications: [...profile.modifications, modification],
  }));
}

export function updateModification(
  state: StoredState,
  profileId: string,
  next: Modification,
): StoredState {
  return withProfile(state, profileId, (profile) => ({
    ...profile,
    modifications: profile.modifications.map((m) => (m.id === next.id ? next : m)),
  }));
}

export function removeModification(
  state: StoredState,
  profileId: string,
  modificationId: string,
): StoredState {
  return withProfile(state, profileId, (profile) => ({
    ...profile,
    modifications: profile.modifications.filter((m) => m.id !== modificationId),
  }));
}

export function addProfile(
  state: StoredState,
  profile: Profile,
  afterProfileId?: string,
): StoredState {
  const index = afterProfileId
    ? state.profiles.findIndex((p) => p.id === afterProfileId)
    : -1;
  const profiles = [...state.profiles];
  profiles.splice(index === -1 ? profiles.length : index + 1, 0, profile);
  return { ...state, profiles };
}

export function removeProfile(state: StoredState, profileId: string): StoredState {
  return { ...state, profiles: state.profiles.filter((p) => p.id !== profileId) };
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
  | { type: 'add-modification'; profileId: string; modification: Modification }
  | { type: 'update-modification'; profileId: string; modification: Modification }
  | { type: 'remove-modification'; profileId: string; modificationId: string };

export function applyCommand(state: StoredState, command: Command): StoredState {
  switch (command.type) {
    case 'toggle-profile':
      return toggleProfile(state, command.profileId, command.active);
    case 'add-profile':
      return addProfile(state, command.profile, command.afterProfileId);
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
    case 'add-modification':
      return addModification(state, command.profileId, command.modification);
    case 'update-modification':
      return updateModification(state, command.profileId, command.modification);
    case 'remove-modification':
      return removeModification(state, command.profileId, command.modificationId);
    default:
      return command satisfies never;
  }
}
