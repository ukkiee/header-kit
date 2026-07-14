import type { Filter, StoredState } from './schema';

/**
 * Time Filter 만료 판정의 단일 정의 — 컴파일 방어층·만료 전이·알람 스케줄이
 * 전부 이 술어를 공유한다. expiresAt이 0 이하(미설정)면 만료로 치지 않는다.
 */
export function isTimeFilterExpired(filter: Filter, now: number): boolean {
  return (
    filter.kind === 'time' && filter.enabled && filter.expiresAt > 0 && filter.expiresAt <= now
  );
}

export function isProfileExpired(
  profile: { active: boolean; filters: Filter[] },
  now: number,
): boolean {
  return profile.active && profile.filters.some((f) => isTimeFilterExpired(f, now));
}

/** 만료됐지만 아직 활성으로 남아 있는 Profile이 있는가 — converge의 즉시 만료 트리거. */
export function hasExpiredProfiles(state: StoredState, now: number): boolean {
  return state.profiles.some((p) => isProfileExpired(p, now));
}

/**
 * 다음 만료 알람을 걸어야 할 시각(ms). 활성 Profile의 enabled Time Filter 중
 * now 이후로 가장 이른 것 — 없으면 null.
 */
export function nextExpiry(state: StoredState, now: number): number | null {
  let earliest: number | null = null;
  for (const profile of state.profiles) {
    if (!profile.active) continue;
    for (const filter of profile.filters) {
      if (filter.kind !== 'time' || !filter.enabled || filter.expiresAt <= now) continue;
      if (earliest === null || filter.expiresAt < earliest) earliest = filter.expiresAt;
    }
  }
  return earliest;
}
