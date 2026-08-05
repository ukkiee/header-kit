import { describe, expect, it } from 'vitest';
import { parseStoredState, SCHEMA_VERSION } from './schema';

describe('parseStoredState', () => {
  /*
   * ADR 0017이 ADR 0010의 "전량 이주"를 개정했다 (티켓 02). 이주 자체는 그대로지만, 이주한
   * 조건 중 넷은 같은 변환 안에서 다시 걷힌다 — 그래서 여기서 재는 것은 "무엇이 남고 무엇이
   * 걷혔는가"이고, 걷혀서 규칙이 넓어졌다는 사실은 공지가 들고 있어야 한다.
   */
  it('프로필 필터를 규칙 conditions로 마이그레이션하고 퇴역분은 걷어낸다 (ADR 0010→0017)', () => {
    const parsed = parseStoredState({
      schemaVersion: 1,
      paused: false,
      profiles: [
        {
          id: 'p1', name: 'P', active: true, color: '#2563eb',
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
    // 살아남는 종류만 남는다 — initiator/tab 도메인과 자동 해제 시각은 퇴역했다.
    expect(m1.conditions).toEqual({
      resourceTypes: ['script'],
      requestMethods: ['post'],
    });
    const m2 = p1.modifications[1]!;
    expect(m2.kind === 'request-header' && m2.urlFilter).toBe('own'); // 자체 스코프 유지
    expect(m2.conditions?.resourceTypes).toEqual(['script']);
    // 규칙 둘 다 조건을 잃었으므로 둘 다 세어진다 — 규칙 단위로 하나씩.
    expect(parsed.retirementNotice).toEqual({ rules: 2 });
  });

  it('disabled 프로필 필터는 마이그레이션하지 않고, 필터 없는 프로필은 그대로다', () => {
    const parsed = parseStoredState({
      schemaVersion: 1,
      paused: false,
      profiles: [
        {
          id: 'p1', name: 'P', active: true, color: '#2563eb',
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
          id: 'p1', name: 'P', active: true, color: '#2563eb',          modifications: [
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

  it('제거된 csp 규칙은 검증 전에 조용히 빠지고 나머지는 온전하다 (ADR 0013)', () => {
    const parsed = parseStoredState({
      schemaVersion: SCHEMA_VERSION,
      paused: false,
      profiles: [
        {
          id: 'p1', name: 'Kept', active: true, color: '#2563eb',
          modifications: [
            { kind: 'csp', id: 'c1', directives: [{ name: 'default-src', value: "'self'" }], comment: '', enabled: true },
            { kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
            { kind: 'redirect', id: 'r1', pattern: '^https://a/(.*)', substitution: 'https://b/\\1', comment: '', enabled: true },
          ],
        },
        { id: 'p2', name: 'Other', active: false, color: '#16a34a', modifications: [] },
      ],
      materialized: { m1: 'trace-abc' },
      customHeaderNames: ['X-Custom'],
    });

    // 기본값 리셋이 아니다 — 프로필과 상태 메타가 그대로 남는다.
    expect(parsed.profiles.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(parsed.profiles[0]).toMatchObject({ name: 'Kept', active: true, color: '#2563eb' });
    expect(parsed.materialized).toEqual({ m1: 'trace-abc' });
    expect(parsed.customHeaderNames).toEqual(['X-Custom']);
    // csp만 빠지고 같은 프로필의 다른 수정은 순서까지 보존된다.
    expect(parsed.profiles[0]?.modifications.map((m) => m.kind)).toEqual(['request-header', 'redirect']);
    expect(parsed.profiles[0]?.modifications.map((m) => m.id)).toEqual(['m1', 'r1']);
  });

  it('유효한 상태는 그대로 통과한다', () => {
    const state = {
      schemaVersion: SCHEMA_VERSION,
      paused: false,
      theme: 'system',
      badgeVisible: true,
      syncBackup: true,
      profiles: [
        {
          id: 'p1',
          name: 'P',
          active: true,
          color: '#2563eb',
          modifications: [{ kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }],
        },
      ],
      materialized: { m1: 'trace-abc' },
      customHeaderNames: ['X-Custom'],
    };

    /*
     * 제안 이력 셋은 **없어도 읽힌다** (티켓 08 수용 기준). 검증보다 먼저 빈 배열을 받으므로
     * 없던 상태가 통째로 기본값으로 교체되지 않는다 — 프로필도 실체화 값도 그대로 살아 있다.
     */
    const parsed = parseStoredState(state);
    expect(parsed).toMatchObject({ ...state, customCookieNames: [], customUserAgents: [] });
    expect(parsed.profiles).toHaveLength(1);
    expect(parsed.materialized).toEqual({ m1: 'trace-abc' });
  });

  it('제안 이력에 문자열 아닌 항목이 섞여 있어도 상태 전체가 살아남는다', () => {
    const parsed = parseStoredState({
      schemaVersion: SCHEMA_VERSION,
      paused: false,
      theme: 'system',
      badgeVisible: true,
      syncBackup: true,
      profiles: [
        {
          id: 'p1', name: 'P', active: true, color: '#2563eb',
          modifications: [],
        },
      ],
      materialized: {},
      customHeaderNames: [],
      customCookieNames: ['ok', 42, null],
      customUserAgents: 'not-an-array',
    });

    expect(parsed.profiles).toHaveLength(1);
    expect(parsed.customCookieNames).toEqual(['ok']);
    expect(parsed.customUserAgents).toEqual([]);
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

  /*
   * **두 글자 라벨은 읽는 문에서 걷힌다** (ADR 0017, 티켓 04) — 어디에서도 렌더되지 않던
   * 죽은 필드다. 재는 것이 두 가지인 이유는 실패 방식이 둘이기 때문이다: 검증이 아직
   * 요구하면 그 필드가 없는 새 상태가 **전량 거부**되어 프로필이 사라지고, 걷어내지 않으면
   * 저장소에 죽은 값이 영원히 실려 다닌다.
   *
   * 이것 때문에 공지가 뜨지는 않는다 — 걸리는 규칙이 하나도 달라지지 않으므로 알릴 것이 없다.
   */
  it('두 글자 라벨은 있어도 걷히고, 없어도 거부되지 않는다', () => {
    const withLabel = parseStoredState({
      schemaVersion: SCHEMA_VERSION,
      paused: false,
      profiles: [
        { id: 'p1', name: 'Kept', active: true, shortLabel: 'KE', color: '#2563eb', modifications: [] },
      ],
    });
    expect(withLabel.profiles.map((p) => p.id)).toEqual(['p1']);
    expect('shortLabel' in withLabel.profiles[0]!).toBe(false);
    expect(withLabel.retirementNotice).toBeUndefined();

    const withoutLabel = parseStoredState({
      schemaVersion: SCHEMA_VERSION,
      paused: false,
      profiles: [{ id: 'p1', name: 'Kept', active: true, color: '#2563eb', modifications: [] }],
    });
    expect(withoutLabel.profiles.map((p) => p.id)).toEqual(['p1']);
  });

  it('color가 없는 이전 v1 상태는 기본값으로 채워 보존한다 (전량 거부 금지)', () => {
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
