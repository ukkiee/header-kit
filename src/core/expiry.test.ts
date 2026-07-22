import { describe, expect, it } from 'vitest';
import { expireRules } from './commands';
import { hasExpiredRules, nextExpiry } from './expiry';
import type { Modification, Profile, RuleConditions, StoredState } from './schema';
import { SCHEMA_VERSION } from './schema';

function rule(id: string, conditions?: RuleConditions, enabled = true): Modification {
  return {
    kind: 'request-header',
    id,
    name: 'X-Test',
    value: 'v',
    enabled,
    mode: 'override',
    emptyMeans: 'remove',
    comment: '',
    ...(conditions !== undefined ? { conditions } : {}),
  };
}

function profile(id: string, active: boolean, modifications: Modification[]): Profile {
  return {
    id,
    name: id,
    active,
    shortLabel: id.charAt(0),
    color: '#2563eb',
    modifications,
  };
}

function state(profiles: Profile[]): StoredState {
  return { schemaVersion: SCHEMA_VERSION, paused: false, profiles, materialized: {}, customHeaderNames: [] };
}

describe('expireRules', () => {
  it('만료된 규칙만 끄고 expiresAt을 소비한다 — 프로필은 그대로 활성', () => {
    const next = expireRules(
      state([
        profile('p', true, [
          rule('expired', { expiresAt: 1_000 }),
          rule('future', { expiresAt: 9_999 }),
          rule('no-timer'),
        ]),
      ]),
      5_000,
    );

    const p = next.profiles[0];
    expect(p?.active).toBe(true);
    expect(p?.modifications.map((m) => m.enabled)).toEqual([false, true, true]);
    expect(p?.modifications[0]?.conditions).toBeUndefined();
    expect(p?.modifications[1]?.conditions?.expiresAt).toBe(9_999);
  });

  it('다른 조건이 있으면 expiresAt만 벗기고 나머지 조건은 남긴다', () => {
    const next = expireRules(
      state([profile('p', true, [rule('m', { expiresAt: 1_000, resourceTypes: ['script'] })])]),
      5_000,
    );

    expect(next.profiles[0]?.modifications[0]?.conditions).toEqual({ resourceTypes: ['script'] });
  });

  it('이미 disabled인 규칙과 비활성 Profile의 규칙은 건드리지 않는다', () => {
    const next = expireRules(
      state([
        profile('p', true, [rule('off', { expiresAt: 1_000 }, false)]),
        profile('q', false, [rule('m', { expiresAt: 1_000 })]),
      ]),
      5_000,
    );

    expect(next.profiles[0]?.modifications[0]?.conditions?.expiresAt).toBe(1_000);
    expect(next.profiles[1]?.modifications[0]?.enabled).toBe(true);
  });

  it('미설정(expiresAt 0)은 만료로 치지 않는다 — 추가 직후 즉시 꺼지는 사고 방지', () => {
    const next = expireRules(state([profile('p', true, [rule('m', { expiresAt: 0 })])]), 5_000);

    expect(next.profiles[0]?.modifications[0]?.enabled).toBe(true);
  });
});

describe('hasExpiredRules', () => {
  it('활성 Profile의 enabled 규칙에 지난 expiresAt이 있으면 true', () => {
    expect(hasExpiredRules(state([profile('p', true, [rule('m', { expiresAt: 1_000 })])]), 5_000)).toBe(true);
  });

  it('비활성 Profile·disabled 규칙·미래 만료는 false', () => {
    expect(
      hasExpiredRules(
        state([
          profile('a', false, [rule('m', { expiresAt: 1_000 })]),
          profile('b', true, [rule('m', { expiresAt: 1_000 }, false)]),
          profile('c', true, [rule('m', { expiresAt: 9_999 })]),
        ]),
        5_000,
      ),
    ).toBe(false);
  });
});

describe('nextExpiry', () => {
  it('활성 Profile의 enabled 규칙 중 가장 이른 미래 만료를 반환한다', () => {
    const value = nextExpiry(
      state([
        profile('a', true, [rule('m', { expiresAt: 8_000 })]),
        profile('b', true, [rule('m', { expiresAt: 3_000 })]),
        profile('c', false, [rule('m', { expiresAt: 2_000 })]), // 비활성 무시
        profile('d', true, [rule('m', { expiresAt: 1_000 })]), // 이미 지난 것 무시
        profile('e', true, [rule('m', { expiresAt: 2_500 }, false)]), // disabled 무시
      ]),
      1_500,
    );

    expect(value).toBe(3_000);
  });

  it('예정된 만료가 없으면 null을 반환한다', () => {
    expect(nextExpiry(state([profile('a', true, [rule('m')])]), 0)).toBeNull();
  });
});
