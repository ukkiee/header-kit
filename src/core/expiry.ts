import type { Modification, StoredState } from './schema';

/**
 * 규칙 자동 해제(ADR 0010) 판정의 단일 정의 — 만료 전이·알람 스케줄·converge
 * 트리거가 전부 이 술어를 공유한다. expiresAt이 0 이하(미설정)면 만료로 치지 않는다.
 */
export function isRuleExpired(modification: Modification, now: number): boolean {
  const expiresAt = modification.conditions?.expiresAt;
  return modification.enabled && expiresAt !== undefined && expiresAt > 0 && expiresAt <= now;
}

/** 만료됐지만 아직 enabled로 남아 있는 규칙이 있는가 — converge의 즉시 만료 트리거. */
export function hasExpiredRules(state: StoredState, now: number): boolean {
  return state.profiles.some(
    (p) => p.active && p.modifications.some((m) => isRuleExpired(m, now)),
  );
}

/**
 * 다음 만료 알람을 걸어야 할 시각(ms). 활성 Profile의 enabled 규칙 중
 * now 이후로 가장 이른 expiresAt — 없으면 null.
 */
export function nextExpiry(state: StoredState, now: number): number | null {
  let earliest: number | null = null;
  for (const profile of state.profiles) {
    if (!profile.active) continue;
    for (const modification of profile.modifications) {
      const expiresAt = modification.conditions?.expiresAt;
      if (!modification.enabled || expiresAt === undefined || expiresAt <= now) continue;
      if (earliest === null || expiresAt < earliest) earliest = expiresAt;
    }
  }
  return earliest;
}
