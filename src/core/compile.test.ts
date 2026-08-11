import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { ALL_RESOURCE_TYPES } from './rules';
import type { Profile } from './schema';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Test Profile',
    active: true,
    color: '#2563eb',
    modifications: [],
    ...overrides,
  };
}

describe('compile', () => {
  it('규칙 conditions가 그 규칙의 DNR 조건으로 직접 내려간다 (ADR 0010)', () => {
    const { rules, warnings } = compile(
      [
        profile({
          modifications: [
            {
              kind: 'request-header',
              id: 'm1',
              name: 'X-C',
              value: '1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
              conditions: {
                excludedDomains: ['skip.io'],
                resourceTypes: ['script'],
                requestMethods: ['post'],
                initiatorDomains: ['init.io'],
              },
            },
            {
              kind: 'request-header',
              id: 'm2',
              name: 'X-Free',
              value: '2',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
    );
    expect(warnings).toEqual([]);
    const c = rules.find((r) => r.action.requestHeaders?.[0]?.header === 'X-C')?.condition;
    expect(c?.resourceTypes).toEqual(['script']);
    expect(c?.requestMethods).toEqual(['post']);
    // 퇴역 조건 둘은 입력에 남아 있어도 **실리지 않는다** (릴리스 게이트 R-2).
    // 입력을 지우지 않는 것이 요점이다 — 매핑이 되살아나면 여기서 붉어진다.
    expect(c?.initiatorDomains).toBeUndefined();
    expect(c?.excludedRequestDomains).toBeUndefined();
    const free = rules.find((r) => r.action.requestHeaders?.[0]?.header === 'X-Free')?.condition;
    expect(free?.requestMethods).toBeUndefined();
  });

  /*
   * **퇴역한 조건 넷은 방출을 막지 않는다** (ADR 0017, 티켓 10).
   *
   * 예전에는 이 자리에 셋이 있었다 — 탭 도메인이 열린 탭으로 전개되는지, 지난 자동 해제
   * 시각이 규칙을 막는지, 미설정 0은 만료로 치지 않는지. 그 조건들이 퇴역해 컴파일이 더는
   * 읽지 않으므로 재는 것을 뒤집는다: 저장소에 남아 있더라도(옛 파일 가져오기·손편집)
   * **규칙이 그대로 나오는지**. 여기서 조용히 걸러지면 사용자는 만든 규칙이 안 걸리는데
   * 화면에는 멀쩡히 서 있는 상태를 겪는다.
   */
  it('저장소에 남은 퇴역 조건은 방출을 막지 않는다', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            {
              kind: 'request-header',
              id: 'm1',
              name: 'X-Stale',
              value: '1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
              conditions: { expiresAt: 100, tabDomains: ['closed.io'] },
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
    );
    expect(rules.map((r) => r.action.requestHeaders?.[0]?.header)).toEqual(['X-Stale']);
    // 탭 조건이 규칙으로 새어 나가지도 않는다 — 읽지 않으니 방출에도 없다.
    expect(rules[0]?.condition.tabIds).toBeUndefined();
  });

  /*
   * **같은 상태면 같은 결과다** (티켓 10 AC3). 컴파일이 현재 시각을 받지 않게 됐다는 것의
   * 관측 가능한 뜻이 이것이다 — 언제 불러도, 몇 번을 불러도 같은 규칙이 나온다. 시각을
   * 다시 끌어들이면(예: 만료 가드를 되살리면) 이 단언이 먼저 깨진다.
   */
  it('같은 상태를 두 번 컴파일하면 같은 규칙이 나온다 — 시각에 의존하지 않는다', () => {
    const state = [
      profile({
        modifications: [
          {
            kind: 'request-header',
            id: 'm1',
            name: 'X-A',
            value: '1',
            enabled: true,
            mode: 'override',
            emptyMeans: 'remove',
            comment: '',
          },
          {
            kind: 'request-header',
            id: 'm2',
            name: 'X-B',
            value: '2',
            enabled: true,
            mode: 'override',
            emptyMeans: 'remove',
            comment: '',
          },
        ],
      }),
    ];
    const first = compile(state, { paused: false, materialized: {} });
    const second = compile(state, { paused: false, materialized: {} });
    expect(second.rules).toEqual(first.rules);
    expect(second.warnings).toEqual(first.warnings);
  });

  it('redirect도 conditions를 상속하되 regexFilter는 자기 pattern이다', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            {
              kind: 'redirect',
              id: 'r1',
              pattern: '^https://a/(.*)',
              substitution: 'https://b/\\1',
              enabled: true,
              comment: '',
              conditions: { requestMethods: ['get'] },
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
    );
    expect(rules[0]?.condition.regexFilter).toBe('^https://a/(.*)');
    expect(rules[0]?.condition.requestMethods).toEqual(['get']);
  });

  it('urlMatchType이 비정규식이면 DNR urlFilter로 매핑되고 regex 카운터를 안 쓴다 (ADR 0008)', () => {
    const mk = (id: string, urlFilter: string, urlMatchType: 'domain' | 'contains' | 'prefix') => ({
      kind: 'request-header' as const,
      id,
      name: `X-${id}`,
      value: '1',
      enabled: true,
      mode: 'override' as const,
      emptyMeans: 'remove' as const,
      comment: '',
      urlFilter,
      urlMatchType,
    });
    const { rules, warnings } = compile(
      [
        profile({
          modifications: [
            mk('d', 'example.com', 'domain'),
            mk('c', '/api/', 'contains'),
            mk('p', 'https://a.io/', 'prefix'),
          ],
        }),
      ],
      { paused: false, materialized: {} },
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
      [
        profile({
          modifications: [
            {
              kind: 'request-header',
              id: 'm1',
              name: 'X',
              value: '1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
              urlFilter: 'legacy\\.regex',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
    );
    expect(rules[0]?.condition.regexFilter).toBe('legacy\\.regex');
    expect(rules[0]?.condition.urlFilter).toBeUndefined();
  });

  it('비정규식 방식도 길이 한도 초과 시 방출하지 않고 경고한다', () => {
    const { rules, warnings } = compile(
      [
        profile({
          modifications: [
            {
              kind: 'request-header',
              id: 'm1',
              name: 'X',
              value: '1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
              urlFilter: 'a'.repeat(3000),
              urlMatchType: 'contains',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
    );
    expect(rules).toHaveLength(0);
    expect(warnings.some((w) => w.code === 'regex-too-long' && w.modificationId === 'm1')).toBe(true);
  });

  it('규칙 자체 urlFilter가 그 규칙의 regexFilter가 된다 — 없는 규칙은 무스코프 (ADR 0007/0010)', () => {
    const { rules, warnings } = compile(
      [
        profile({
          modifications: [
            {
              kind: 'request-header',
              id: 'm1',
              name: 'X-Own',
              value: '1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
              urlFilter: 'own\\.scope',
            },
            {
              kind: 'request-header',
              id: 'm2',
              name: 'X-Free',
              value: '2',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
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
            {
              kind: 'request-header',
              id: 'm1',
              name: 'X-Long',
              value: '1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
              urlFilter: 'a'.repeat(3000),
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
    );
    expect(rules).toHaveLength(0);
    expect(warnings.some((w) => w.code === 'regex-too-long' && w.modificationId === 'm1')).toBe(true);
  });

  it('공백뿐인 urlFilter는 프로필 조인을 그대로 쓴다', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            {
              kind: 'request-header',
              id: 'm1',
              name: 'X-A',
              value: '1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
              urlFilter: '   ',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition.regexFilter).toBeUndefined();
  });

  it('활성 Profile의 enabled Request Header를 set 규칙으로 컴파일한다', () => {
    const { rules, warnings } = compile(
      [
        profile({
          modifications: [
            {
              kind: 'request-header',
              id: 'm1',
              name: 'X-Debug',
              value: 'on',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
            {
              kind: 'request-header',
              id: 'm2',
              name: 'X-Trace',
              value: 'abc',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
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
    expect(rules[1]?.action.requestHeaders).toEqual([{ header: 'X-Trace', operation: 'set', value: 'abc' }]);
  });

  it('비활성 Profile과 disabled Modification은 규칙을 만들지 않는다', () => {
    const { rules } = compile(
      [
        profile({
          active: false,
          modifications: [
            {
              kind: 'request-header',
              id: 'm1',
              name: 'X-A',
              value: '1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
        profile({
          id: 'p2',
          modifications: [
            {
              kind: 'request-header',
              id: 'm2',
              name: 'X-B',
              value: '2',
              enabled: false,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
    );

    expect(rules).toEqual([]);
  });

  it('Pause 상태에서는 규칙이 없다', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            {
              kind: 'request-header',
              id: 'm1',
              name: 'X-A',
              value: '1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
      ],
      { paused: true, materialized: {} },
    );

    expect(rules).toEqual([]);
  });

  it('이름이 빈 Modification은 건너뛰고 경고를 반환한다', () => {
    const { rules, warnings } = compile(
      [
        profile({
          modifications: [
            {
              kind: 'request-header',
              id: 'm1',
              name: '  ',
              value: '1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
            {
              kind: 'request-header',
              id: 'm2',
              name: 'X-Ok',
              value: '2',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
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
      [
        profile({
          modifications: [
            {
              kind: 'request-header',
              id: 'm1',
              name: 'X-Empty',
              value: '',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
    );

    expect(rules[0]?.action.requestHeaders).toEqual([{ header: 'X-Empty', operation: 'remove' }]);
  });

  it('충돌 의미론: 목록 위쪽 Profile의 규칙이 더 높은 priority를 받는다', () => {
    const { rules } = compile(
      [
        profile({
          id: 'top',
          modifications: [
            {
              kind: 'request-header',
              id: 'a1',
              name: 'X-Conf',
              value: 'top-1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
            {
              kind: 'request-header',
              id: 'a2',
              name: 'X-Other',
              value: 'top-2',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
        profile({
          id: 'bottom',
          modifications: [
            {
              kind: 'request-header',
              id: 'b1',
              name: 'X-Conf',
              value: 'bottom-1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
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
            {
              kind: 'request-header',
              id: 'a1',
              name: 'X-A',
              value: '1',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
        profile({
          id: 'bottom',
          modifications: [
            {
              kind: 'request-header',
              id: 'b1',
              name: 'X-B',
              value: '2',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
    );
    const alone = compile(
      [
        profile({
          id: 'bottom',
          modifications: [
            {
              kind: 'request-header',
              id: 'b1',
              name: 'X-B',
              value: '2',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
    );

    expect(active.rules.map((r) => r.priority)).toEqual(alone.rules.map((r) => r.priority));
  });

  it('서로 다른 활성 Profile이 같은 헤더를 수정하면 겹침 경고를 반환한다', () => {
    const { warnings } = compile(
      [
        profile({
          id: 'top',
          modifications: [
            {
              kind: 'request-header',
              id: 'a1',
              name: 'X-Conf',
              value: 'a',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
        profile({
          id: 'bottom',
          modifications: [
            {
              kind: 'request-header',
              id: 'b1',
              name: 'x-conf',
              value: 'b',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
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
            {
              kind: 'request-header',
              id: 'a1',
              name: 'X-Conf',
              value: 'a',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
            {
              kind: 'request-header',
              id: 'a2',
              name: 'X-Conf',
              value: 'a2',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
            {
              kind: 'request-header',
              id: 'a3',
              name: 'X-Off',
              value: 'x',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
        profile({
          id: 'mid',
          active: false,
          modifications: [
            {
              kind: 'request-header',
              id: 'c1',
              name: 'X-Conf',
              value: 'c',
              enabled: true,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
        profile({
          id: 'bottom',
          modifications: [
            {
              kind: 'request-header',
              id: 'b1',
              name: 'X-Off',
              value: 'b',
              enabled: false,
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
            },
          ],
        }),
      ],
      { paused: false, materialized: {} },
    );

    expect(warnings).toEqual([]);
  });

  it('같은 입력은 같은 출력을 낸다 (순수성 스모크)', () => {
    const profiles = [
      profile({
        modifications: [
          {
            kind: 'request-header',
            id: 'm1',
            name: 'X-A',
            value: '1',
            enabled: true,
            mode: 'override',
            emptyMeans: 'remove',
            comment: '',
          },
        ],
      }),
    ];
    const a = compile(profiles, { paused: false, materialized: {} });
    const b = compile(profiles, { paused: false, materialized: {} });

    expect(a).toEqual(b);
  });
});
