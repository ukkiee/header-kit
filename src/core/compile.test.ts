import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { ALL_RESOURCE_TYPES } from './rules';
import type { Profile } from './schema';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Test Profile',
    active: true,
    shortLabel: 'T',
    color: '#2563eb',
    modifications: [],
    filters: [],
    ...overrides,
  };
}

describe('compile', () => {
  it('urlMatchType이 비정규식이면 DNR urlFilter로 매핑되고 regex 카운터를 안 쓴다 (ADR 0008)', () => {
    const mk = (id: string, urlFilter: string, urlMatchType: 'domain' | 'contains' | 'prefix') => ({
      kind: 'request-header' as const, id, name: `X-${id}`, value: '1', enabled: true,
      mode: 'override' as const, emptyMeans: 'remove' as const, comment: '', urlFilter, urlMatchType,
    });
    const { rules, warnings } = compile(
      [profile({ modifications: [mk('d', 'example.com', 'domain'), mk('c', '/api/', 'contains'), mk('p', 'https://a.io/', 'prefix')] })],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );
    expect(warnings).toEqual([]);
    const by = (h: string) => rules.find((r) => r.action.requestHeaders?.[0]?.header === h)?.condition;
    expect(by('X-d')?.urlFilter).toBe('||example.com');
    expect(by('X-c')?.urlFilter).toBe('/api/');
    expect(by('X-p')?.urlFilter).toBe('|https://a.io/');
    for (const h of ['X-d', 'X-c', 'X-p']) expect(by(h)?.regexFilter).toBeUndefined();
  });

  it('urlMatchType 부재 + urlFilter 존재 = regex (하위 호환)', () => {
    const { rules } = compile(
      [profile({ modifications: [
        { kind: 'request-header', id: 'm1', name: 'X', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '', urlFilter: 'legacy\\.regex' },
      ] })],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );
    expect(rules[0]?.condition.regexFilter).toBe('legacy\\.regex');
    expect(rules[0]?.condition.urlFilter).toBeUndefined();
  });

  it('비정규식 방식도 길이 한도 초과 시 방출하지 않고 경고한다', () => {
    const { rules, warnings } = compile(
      [profile({ modifications: [
        { kind: 'request-header', id: 'm1', name: 'X', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '', urlFilter: 'a'.repeat(3000), urlMatchType: 'contains' },
      ] })],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );
    expect(rules).toHaveLength(0);
    expect(warnings.some((w) => w.code === 'regex-too-long' && w.modificationId === 'm1')).toBe(true);
  });

  it('규칙 자체 urlFilter가 있으면 그 규칙의 regexFilter가 되고 프로필 URL 조인을 대체한다 (ADR 0007)', () => {
    const { rules, warnings } = compile(
      [
        profile({
          filters: [{ kind: 'url', id: 'f1', enabled: true, pattern: 'profile\\.scope' }],
          modifications: [
            { kind: 'request-header', id: 'm1', name: 'X-Own', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '', urlFilter: 'own\\.scope' },
            { kind: 'request-header', id: 'm2', name: 'X-Inherit', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(warnings).toEqual([]);
    const own = rules.find((r) => r.action.requestHeaders?.[0]?.header === 'X-Own');
    const inherit = rules.find((r) => r.action.requestHeaders?.[0]?.header === 'X-Inherit');
    expect(own?.condition.regexFilter).toBe('own\\.scope');
    expect(inherit?.condition.regexFilter).toBe('(?:profile\\.scope)');
  });

  it('CSP 규칙도 자체 urlFilter를 쓴다', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            { kind: 'csp', id: 'c1', directives: [{ name: 'default-src', value: "'self'" }], enabled: true, comment: '', urlFilter: 'csp\\.only' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition.regexFilter).toBe('csp\\.only');
  });

  it('자체 urlFilter가 한도를 넘으면 규칙을 방출하지 않고 경고한다 (스코프 확대 금지)', () => {
    const { rules, warnings } = compile(
      [
        profile({
          modifications: [
            { kind: 'request-header', id: 'm1', name: 'X-Long', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '', urlFilter: 'a'.repeat(3000) },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );
    expect(rules).toHaveLength(0);
    expect(warnings.some((w) => w.code === 'regex-too-long' && w.modificationId === 'm1')).toBe(true);
  });

  it('공백뿐인 urlFilter는 프로필 조인을 그대로 쓴다', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            { kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '', urlFilter: '   ' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition.regexFilter).toBeUndefined();
  });

  it('활성 Profile의 enabled Request Header를 set 규칙으로 컴파일한다', () => {
    const { rules, warnings } = compile(
      [
        profile({
          modifications: [
            { kind: 'request-header', id: 'm1', name: 'X-Debug', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
            { kind: 'request-header', id: 'm2', name: 'X-Trace', value: 'abc', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(warnings).toEqual([]);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual({
      id: 1,
      // 대역 폭 = enabled 2 + allow 슬롯 1, 앞선 Modification이 더 높다
      priority: 2,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'X-Debug', operation: 'set', value: 'on' }],
      },
      condition: { resourceTypes: [...ALL_RESOURCE_TYPES] },
    });
    expect(rules[1]?.id).toBe(2);
    expect(rules[1]?.action.requestHeaders).toEqual([
      { header: 'X-Trace', operation: 'set', value: 'abc' },
    ]);
  });

  it('비활성 Profile과 disabled Modification은 규칙을 만들지 않는다', () => {
    const { rules } = compile(
      [
        profile({
          active: false,
          modifications: [{ kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }],
        }),
        profile({
          id: 'p2',
          modifications: [{ kind: 'request-header', id: 'm2', name: 'X-B', value: '2', enabled: false, mode: 'override', emptyMeans: 'remove', comment: '' }],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(rules).toEqual([]);
  });

  it('Pause 상태에서는 규칙이 없다', () => {
    const { rules } = compile(
      [profile({ modifications: [{ kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }] })],
      { paused: true, tabs: [], now: 0, materialized: {} },
    );

    expect(rules).toEqual([]);
  });

  it('이름이 빈 Modification은 건너뛰고 경고를 반환한다', () => {
    const { rules, warnings } = compile(
      [
        profile({
          modifications: [
            { kind: 'request-header', id: 'm1', name: '  ', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
            { kind: 'request-header', id: 'm2', name: 'X-Ok', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(rules).toHaveLength(1);
    expect(rules[0]?.action.requestHeaders?.[0]?.header).toBe('X-Ok');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: 'empty-header-name',
      profileId: 'p1',
      modificationId: 'm1',
    });
  });

  it('빈 값은 기본(emptyMeans=remove)으로 제거 연산이 된다 (이슈 02에서 세분화)', () => {
    const { rules } = compile(
      [profile({ modifications: [{ kind: 'request-header', id: 'm1', name: 'X-Empty', value: '', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }] })],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(rules[0]?.action.requestHeaders).toEqual([{ header: 'X-Empty', operation: 'remove' }]);
  });

  it('충돌 의미론: 목록 위쪽 Profile의 규칙이 더 높은 priority를 받는다', () => {
    const { rules } = compile(
      [
        profile({
          id: 'top',
          modifications: [
            { kind: 'request-header', id: 'a1', name: 'X-Conf', value: 'top-1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
            { kind: 'request-header', id: 'a2', name: 'X-Other', value: 'top-2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
        profile({
          id: 'bottom',
          modifications: [
            { kind: 'request-header', id: 'b1', name: 'X-Conf', value: 'bottom-1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(rules).toHaveLength(3);
    const [a1, a2, b1] = rules;
    // Profile 내부: 앞선 Modification이 더 높다
    expect(a1!.priority).toBeGreaterThan(a2!.priority);
    // 대역: 위 Profile의 가장 낮은 규칙도 아래 Profile의 가장 높은 규칙보다 높다
    expect(a2!.priority).toBeGreaterThan(b1!.priority);
    // 대역 사이에는 Exclude allow 슬롯이 예약되어 있다 (인접 priority가 아님)
    expect(a2!.priority - b1!.priority).toBeGreaterThanOrEqual(2);
    expect(b1!.priority).toBeGreaterThanOrEqual(1);
  });

  it('비활성 Profile은 priority 대역을 차지하지 않는다', () => {
    const active = compile(
      [
        profile({
          id: 'top',
          active: false,
          modifications: [
            { kind: 'request-header', id: 'a1', name: 'X-A', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
        profile({
          id: 'bottom',
          modifications: [
            { kind: 'request-header', id: 'b1', name: 'X-B', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );
    const alone = compile(
      [
        profile({
          id: 'bottom',
          modifications: [
            { kind: 'request-header', id: 'b1', name: 'X-B', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(active.rules.map((r) => r.priority)).toEqual(alone.rules.map((r) => r.priority));
  });

  it('서로 다른 활성 Profile이 같은 헤더를 수정하면 겹침 경고를 반환한다', () => {
    const { warnings } = compile(
      [
        profile({
          id: 'top',
          modifications: [
            { kind: 'request-header', id: 'a1', name: 'X-Conf', value: 'a', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
        profile({
          id: 'bottom',
          modifications: [
            { kind: 'request-header', id: 'b1', name: 'x-conf', value: 'b', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: 'header-overlap',
      header: 'x-conf',
      profileIds: ['top', 'bottom'],
    });
  });

  it('겹침 경고는 비활성 Profile·disabled Modification·동일 Profile 내 중복을 무시한다', () => {
    const { warnings } = compile(
      [
        profile({
          id: 'top',
          modifications: [
            { kind: 'request-header', id: 'a1', name: 'X-Conf', value: 'a', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
            { kind: 'request-header', id: 'a2', name: 'X-Conf', value: 'a2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
            { kind: 'request-header', id: 'a3', name: 'X-Off', value: 'x', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
        profile({
          id: 'mid',
          active: false,
          modifications: [
            { kind: 'request-header', id: 'c1', name: 'X-Conf', value: 'c', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
        profile({
          id: 'bottom',
          modifications: [
            { kind: 'request-header', id: 'b1', name: 'X-Off', value: 'b', enabled: false, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(warnings).toEqual([]);
  });

  it('같은 입력은 같은 출력을 낸다 (순수성 스모크)', () => {
    const profiles = [
      profile({ modifications: [{ kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }] }),
    ];
    const a = compile(profiles, { paused: false, tabs: [], now: 0, materialized: {} });
    const b = compile(profiles, { paused: false, tabs: [], now: 0, materialized: {} });

    expect(a).toEqual(b);
  });
});
