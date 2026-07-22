import { describe, expect, it } from 'vitest';
import { parseStoredState, SCHEMA_VERSION } from './schema';

describe('parseStoredState', () => {
  it('프로필 필터를 규칙 conditions로 마이그레이션한다 (ADR 0010, 의미론 보존)', () => {
    const parsed = parseStoredState({
      schemaVersion: 1,
      paused: false,
      profiles: [
        {
          id: 'p1', name: 'P', active: true, shortLabel: 'P', color: '#2563eb',
          modifications: [
            { kind: 'request-header', id: 'm1', name: 'X', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
            // 자체 urlFilter가 있는 규칙은 URL 스코프를 유지한다 (0007 의미론)
            { kind: 'request-header', id: 'm2', name: 'Y', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '', urlFilter: 'own', urlMatchType: 'contains' },
          ],
          filters: [
            { kind: 'url', id: 'f1', enabled: true, pattern: 'a\\.com' },
            { kind: 'url', id: 'f2', enabled: true, pattern: 'b\\.com' },
            { kind: 'resource-type', id: 'f3', enabled: true, resourceTypes: ['script'] },
            { kind: 'request-method', id: 'f4', enabled: true, methods: ['post'] },
            { kind: 'initiator-domain', id: 'f5', enabled: true, domain: 'init.io' },
            { kind: 'tab-domain', id: 'f6', enabled: true, domain: 'tab.io' },
            { kind: 'time', id: 'f7', enabled: true, expiresAt: 500 },
            { kind: 'time', id: 'f8', enabled: true, expiresAt: 300 },
            { kind: 'exclude-url', id: 'f9', enabled: true, pattern: 'gone' }, // 소실 (ADR 명시)
            { kind: 'tab', id: 'f10', enabled: true, tabId: 3 }, // 소실
          ],
        },
      ],
    });

    const p1 = parsed.profiles[0]!;
    expect('filters' in p1).toBe(false);
    const m1 = p1.modifications[0]!;
    expect(m1.kind === 'request-header' && m1.urlFilter).toBe('(?:a\\.com)|(?:b\\.com)');
    expect(m1.kind === 'request-header' && m1.urlMatchType).toBe('regex');
    expect(m1.conditions).toEqual({
      resourceTypes: ['script'],
      requestMethods: ['post'],
      initiatorDomains: ['init.io'],
      tabDomains: ['tab.io'],
      expiresAt: 300, // 최솟값
    });
    const m2 = p1.modifications[1]!;
    expect(m2.kind === 'request-header' && m2.urlFilter).toBe('own'); // 자체 스코프 유지
    expect(m2.conditions?.resourceTypes).toEqual(['script']);
  });

  it('disabled 프로필 필터는 마이그레이션하지 않고, 필터 없는 프로필은 그대로다', () => {
    const parsed = parseStoredState({
      schemaVersion: 1,
      paused: false,
      profiles: [
        {
          id: 'p1', name: 'P', active: true, shortLabel: 'P', color: '#2563eb',
          modifications: [
            { kind: 'request-header', id: 'm1', name: 'X', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
          filters: [{ kind: 'resource-type', id: 'f1', enabled: false, resourceTypes: ['image'] }],
        },
      ],
    });
    expect(parsed.profiles[0]?.modifications[0]?.conditions).toBeUndefined();
  });

  it('urlFilter(ADR 0007)는 선택 문자열 — 비문자열이나 redirect의 것은 거부한다', () => {
    const base = {
      schemaVersion: 1,
      paused: false,
      profiles: [
        {
          id: 'p1', name: 'P', active: true, shortLabel: 'P', color: '#2563eb',          modifications: [
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
