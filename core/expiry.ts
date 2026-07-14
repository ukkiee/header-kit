import type { StoredState } from './schema';

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
