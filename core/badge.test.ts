import { describe, expect, it } from 'vitest';
import { computeBadge } from './badge';
import type { Profile, StoredState } from './schema';
import { SCHEMA_VERSION } from './schema';

function profile(overrides: Partial<Profile>): Profile {
  return {
    id: 'p1',
    name: 'One',
    active: false,
    shortLabel: '1',
    color: '#2563eb',
    modifications: [],
    filters: [],
    ...overrides,
  };
}

function state(profiles: Profile[], paused = false): StoredState {
  return { schemaVersion: SCHEMA_VERSION, paused, profiles, materialized: {} };
}

describe('computeBadge', () => {
  it('Pause 상태가 활성 표시보다 우선한다', () => {
    const badge = computeBadge(state([profile({ active: true })], true));

    expect(badge.text).toBe('II');
  });

  it('활성 Profile이 없으면 배지가 비어 있다', () => {
    expect(computeBadge(state([profile({})])).text).toBe('');
  });

  it('활성 Profile이 하나면 그 shortLabel과 색을 쓴다', () => {
    const badge = computeBadge(
      state([profile({ active: true, shortLabel: 'QA', color: '#d97706' })]),
    );

    expect(badge).toEqual({ text: 'QA', color: '#d97706' });
  });

  it('활성 Profile이 여럿이면 개수를 표시한다', () => {
    const badge = computeBadge(
      state([
        profile({ id: 'a', active: true }),
        profile({ id: 'b', active: true }),
        profile({ id: 'c', active: false }),
      ]),
    );

    expect(badge.text).toBe('2');
  });
});
