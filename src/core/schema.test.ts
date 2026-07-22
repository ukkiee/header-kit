import { describe, expect, it } from 'vitest';
import { parseStoredState, SCHEMA_VERSION } from './schema';

describe('parseStoredState', () => {
  it('urlFilter(ADR 0007)는 선택 문자열 — 비문자열이나 redirect의 것은 거부한다', () => {
    const base = {
      schemaVersion: 1,
      paused: false,
      profiles: [
        {
          id: 'p1', name: 'P', active: true, shortLabel: 'P', color: '#2563eb', filters: [],
          modifications: [
            { kind: 'request-header', id: 'm1', name: 'X', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '', urlFilter: 'api\\.example' },
          ],
        },
      ],
    };
    const parsed = parseStoredState(base);
    const mod = parsed.profiles[0]?.modifications[0];
    expect(mod && 'urlFilter' in mod && mod.urlFilter).toBe('api\\.example');

    // 비문자열 urlFilter → 프로필 전체 거부(기본 상태 대체)
    const bad = structuredClone(base);
    (bad.profiles[0]!.modifications[0] as Record<string, unknown>).urlFilter = 42;
    expect(parseStoredState(bad).profiles.some((p) => p.id === 'p1')).toBe(false);

    // redirect에 urlFilter → 치유(필드 제거) — 전체 상태 리셋 대신 프로필 보존
    const redirectBad = structuredClone(base);
    redirectBad.profiles[0]!.modifications = [
      { kind: 'redirect', id: 'r1', pattern: '^a', substitution: 'b', enabled: true, comment: '', urlFilter: 'x' } as never,
    ];
    const healed = parseStoredState(redirectBad);
    expect(healed.profiles[0]?.id).toBe('p1');
    expect('urlFilter' in (healed.profiles[0]?.modifications[0] ?? {})).toBe(false);
  });

  it('유효한 상태는 그대로 통과한다', () => {
    const state = {
      schemaVersion: SCHEMA_VERSION,
      paused: false,
      profiles: [
        {
          id: 'p1',
          name: 'P',
          active: true,
          shortLabel: 'P',
          color: '#2563eb',
          modifications: [{ kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }],
          filters: [
            { kind: 'url', id: 'f1', enabled: true, pattern: 'api\\.example\\.com' },
            { kind: 'resource-type', id: 'f2', enabled: true, resourceTypes: ['xmlhttprequest'] },
          ],
        },
      ],
      materialized: { m1: 'trace-abc' },
      customHeaderNames: ['X-Custom'],
    };

    expect(parseStoredState(state)).toEqual(state);
  });

  function expectDefaultState(actual: unknown) {
    // createDefaultState()는 호출마다 새 Profile id를 만들므로 형태로 비교한다.
    expect(actual).toMatchObject({
      customHeaderNames: [],
      schemaVersion: SCHEMA_VERSION,
      paused: false,
      profiles: [{ name: 'Default Profile', active: true, modifications: [] }],
    });
  }

  it('저장된 값이 없으면(undefined) 기본 상태를 반환한다', () => {
    expectDefaultState(parseStoredState(undefined));
  });

  it('shortLabel/color가 없는 이전 v1 상태는 기본값으로 채워 보존한다 (전량 거부 금지)', () => {
    const legacy = {
      schemaVersion: SCHEMA_VERSION,
      paused: false,
      profiles: [
        {
          id: 'p1',
          name: 'kept',
          active: true,
          modifications: [
            { kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        },
      ],
    };

    const parsed = parseStoredState(legacy);

    expect(parsed.profiles[0]).toMatchObject({
      id: 'p1',
      name: 'kept',
      active: true,
      shortLabel: 'K',
    });
    expect(typeof parsed.profiles[0]?.color).toBe('string');
    expect(parsed.profiles[0]?.modifications).toHaveLength(1);
  });

  it.each([
    ['버전 불일치', { schemaVersion: 999, paused: false, profiles: [] }],
    ['profiles가 배열이 아님', { schemaVersion: SCHEMA_VERSION, paused: false, profiles: 'x' }],
    [
      'Modification 필드 타입 위반',
      {
        schemaVersion: SCHEMA_VERSION,
        paused: false,
        profiles: [
          {
            id: 'p1',
            name: 'P',
            active: true,
            shortLabel: 'P',
            color: '#2563eb',
            modifications: [{ kind: 'request-header', id: 'm1', name: 'X', value: 1, enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }],
          },
        ],
      },
    ],
  ])('%s → 전량 거부하고 기본 상태로 대체한다', (_label, broken) => {
    expectDefaultState(parseStoredState(broken));
  });
});
