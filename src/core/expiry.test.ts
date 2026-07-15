import { describe, expect, it } from 'vitest';
import { expireProfiles } from './commands';
import { nextExpiry } from './expiry';
import type { Filter, Profile, StoredState } from './schema';
import { SCHEMA_VERSION } from './schema';

function timeFilter(expiresAt: number, enabled = true): Filter {
  return { kind: 'time', id: `t${expiresAt}`, enabled, expiresAt };
}

function profile(id: string, active: boolean, filters: Filter[]): Profile {
  return {
    id,
    name: id,
    active,
    shortLabel: id.charAt(0),
    color: '#2563eb',
    modifications: [],
    filters,
  };
}

function state(profiles: Profile[]): StoredState {
  return { schemaVersion: SCHEMA_VERSION, paused: false, profiles, materialized: {}, customHeaderNames: [] };
}

describe('expireProfiles', () => {
  it('만료된 활성 Profile만 비활성으로 전환한다', () => {
    const next = expireProfiles(
      state([
        profile('expired', true, [timeFilter(1_000)]),
        profile('future', true, [timeFilter(9_999)]),
        profile('no-timer', true, []),
        profile('already-off', false, [timeFilter(1_000)]),
      ]),
      5_000,
    );

    expect(next.profiles.map((p) => p.active)).toEqual([false, true, true, false]);
  });

  it('disabled Time Filter는 무시한다', () => {
    const next = expireProfiles(
      state([profile('p', true, [timeFilter(1_000, false)])]),
      5_000,
    );

    expect(next.profiles[0]?.active).toBe(true);
  });

  it('미설정(expiresAt 0)은 만료로 치지 않는다 — 추가 직후 즉시 꺼지는 사고 방지', () => {
    const next = expireProfiles(state([profile('p', true, [timeFilter(0)])]), 5_000);

    expect(next.profiles[0]?.active).toBe(true);
  });
});

describe('nextExpiry', () => {
  it('활성 Profile의 enabled Time Filter 중 가장 이른 미래 만료를 반환한다', () => {
    const value = nextExpiry(
      state([
        profile('a', true, [timeFilter(8_000)]),
        profile('b', true, [timeFilter(3_000)]),
        profile('c', false, [timeFilter(2_000)]), // 비활성 무시
        profile('d', true, [timeFilter(1_000)]), // 이미 지난 것 무시
      ]),
      1_500,
    );

    expect(value).toBe(3_000);
  });

  it('예정된 만료가 없으면 null을 반환한다', () => {
    expect(nextExpiry(state([profile('a', true, [])]), 0)).toBeNull();
  });
});
