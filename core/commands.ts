import type { Modification, Profile, StoredState } from './schema';

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
