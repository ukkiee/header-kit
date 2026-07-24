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
    ...overrides,
  };
}

describe('compile', () => {
  it('규칙 conditions가 그 규칙의 DNR 조건으로 직접 내려간다 (ADR 0010)', () => {
    const { rules, warnings } = compile(
      [profile({ modifications: [
        { kind: 'request-header', id: 'm1', name: 'X-C', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
          conditions: { excludedDomains: ['skip.io'], resourceTypes: ['script'], requestMethods: ['post'], initiatorDomains: ['init.io'] } },
        { kind: 'request-header', id: 'm2', name: 'X-Free', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
      ] })],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );
    expect(warnings).toEqual([]);
    const c = rules.find((r) => r.action.requestHeaders?.[0]?.header === 'X-C')?.condition;
    expect(c?.resourceTypes).toEqual(['script']);
    expect(c?.requestMethods).toEqual(['post']);
    expect(c?.initiatorDomains).toEqual(['init.io']);
    expect(c?.excludedRequestDomains).toEqual(['skip.io']);
    const free = rules.find((r) => r.action.requestHeaders?.[0]?.header === 'X-Free')?.condition;
    expect(free?.requestMethods).toBeUndefined();
  });

  it('tabDomains는 매칭 탭으로 전개되고, 매칭 탭이 없으면 그 규칙만 방출되지 않는다', () => {
    const tabs = [
      { tabId: 7, url: 'https://app.example.com/x' },
      { tabId: 9, url: 'https://other.io/' },
    ];
    const { rules } = compile(
      [profile({ modifications: [
        { kind: 'request-header', id: 'm1', name: 'X-Tab', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
          conditions: { tabDomains: ['example.com'] } },
        { kind: 'request-header', id: 'm2', name: 'X-NoTab', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
          conditions: { tabDomains: ['closed.io'] } },
      ] })],
      { paused: false, tabs, now: 0, materialized: {} },
    );
    const tab = rules.find((r) => r.action.requestHeaders?.[0]?.header === 'X-Tab');
    expect(tab?.condition.tabIds).toEqual([7]);
    expect(rules.some((r) => r.action.requestHeaders?.[0]?.header === 'X-NoTab')).toBe(false);
  });

  it('만료된 규칙(conditions.expiresAt <= now)은 방출되지 않는다', () => {
    const { rules } = compile(
      [profile({ modifications: [
        { kind: 'request-header', id: 'm1', name: 'X-Old', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
          conditions: { expiresAt: 100 } },
        { kind: 'request-header', id: 'm2', name: 'X-Live', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
          conditions: { expiresAt: 900 } },
      ] })],
      { paused: false, tabs: [], now: 500, materialized: {} },
    );
    expect(rules.map((r) => r.action.requestHeaders?.[0]?.header)).toEqual(['X-Live']);
  });

  it('미설정(expiresAt 0)은 만료로 치지 않는다 — 방출 가드와 알람 술어가 같은 정의를 쓴다', () => {
    const { rules } = compile(
      [profile({ modifications: [
        { kind: 'request-header', id: 'm1', name: 'X-Unset', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
          conditions: { expiresAt: 0 } },
      ] })],
      { paused: false, tabs: [], now: 500, materialized: {} },
    );
    expect(rules.map((r) => r.action.requestHeaders?.[0]?.header)).toEqual(['X-Unset']);
  });

  it('redirect도 conditions를 상속하되 regexFilter는 자기 pattern이다', () => {
    const { rules } = compile(
      [profile({ modifications: [
        { kind: 'redirect', id: 'r1', pattern: '^https://a/(.*)', substitution: 'https://b/\\1', enabled: true, comment: '',
          conditions: { requestMethods: ['get'] } },
      ] })],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );
    expect(rules[0]?.condition.regexFilter).toBe('^https://a/(.*)');
    expect(rules[0]?.condition.requestMethods).toEqual(['get']);
  });

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

  it('규칙 자체 urlFilter가 그 규칙의 regexFilter가 된다 — 없는 규칙은 무스코프 (ADR 0007/0010)', () => {
    const { rules, warnings } = compile(
      [
        profile({
          modifications: [
            { kind: 'request-header', id: 'm1', name: 'X-Own', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '', urlFilter: 'own\\.scope' },
            { kind: 'request-header', id: 'm2', name: 'X-Free', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(warnings).toEqual([]);
    const own = rules.find((r) => r.action.requestHeaders?.[0]?.header === 'X-Own');
    const free = rules.find((r) => r.action.requestHeaders?.[0]?.header === 'X-Free');
    expect(own?.condition.regexFilter).toBe('own\\.scope');
    expect(free?.condition.regexFilter).toBeUndefined();
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
    // 대역이 인접해도 위 Profile이 항상 높다 (allow 슬롯 예약은 ADR 0010에서 퇴역)
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
