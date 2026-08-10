import { describe, expect, it } from 'vitest';
import { compile, type CompileEnv } from './compile';
import { ALL_RESOURCE_TYPES } from './rules';
import type { Modification, Profile, RuleConditions } from './schema';

function mod(
  id: string,
  name: string,
  extra: { conditions?: RuleConditions; urlFilter?: string } = {},
): Modification {
  return { kind: 'request-header', id, name, value: 'v', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '', ...extra };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'P',
    active: true,
    color: '#2563eb',
    modifications: [mod('m1', 'X-A')],
    ...overrides,
  };
}

const env: CompileEnv = { paused: false, materialized: {} };

function conditionOf(rules: ReturnType<typeof compile>['rules'], header: string) {
  return rules.find((r) => r.action.requestHeaders?.[0]?.header === header)?.condition;
}

describe('compile — 규칙 conditions의 DNR 매핑 (ADR 0010)', () => {
  it('규칙의 conditions 전부가 그 규칙 하나의 DNR 조건 필드로 함께 실린다', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            mod('m1', 'X-A', {
              conditions: {
                resourceTypes: ['xmlhttprequest'],
                requestMethods: ['post'],
                initiatorDomains: ['dev.example.com'],
                excludedDomains: ['private.example.com'],
              },
            }),
          ],
        }),
      ],
      env,
    );

    expect(rules).toHaveLength(1);
    /*
     * 퇴역 조건 둘(initiator/excluded 도메인)은 입력에 있어도 조건에 **없다** — 컴파일이
     * 읽지 않기 때문이다 (릴리스 게이트 R-2). `toEqual`로 통째로 재는 것이 요점이다:
     * 매핑이 되살아나면 여분 키가 생겨 여기서 붉어진다.
     */
    expect(rules[0]?.condition).toEqual({
      resourceTypes: ['xmlhttprequest'],
      requestMethods: ['post'],
    });
  });

  it('conditions 부재와 빈 배열은 같다 — resourceTypes는 ALL로, 나머지 조건 필드는 생략된다', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            mod('m1', 'X-Absent'),
            mod('m2', 'X-Empty', {
              conditions: { resourceTypes: [], requestMethods: [], initiatorDomains: [], excludedDomains: [] },
            }),
          ],
        }),
      ],
      env,
    );

    const unconditional = { resourceTypes: [...ALL_RESOURCE_TYPES] };
    expect(conditionOf(rules, 'X-Absent')).toEqual(unconditional);
    expect(conditionOf(rules, 'X-Empty')).toEqual(unconditional);
  });

  /*
   * 이 자리는 **트리밍을 재던 곳**이었다 (릴리스 게이트 R-2 이전). 컴파일이 두 도메인
   * 조건을 다듬어 실었으므로 공백만 든 항목이 걸러지는지가 계약이었는데, 그 매핑 자체가
   * 사라져 다듬을 대상이 없다. 지우는 대신 **어떤 모양으로 남아 있어도 실리지 않는다**를
   * 재도록 뒤집는다 — 값이 든 것·공백만 든 것·빈 배열 셋을 함께 넣어, 매핑이 되살아나면
   * 그중 하나라도 반드시 붉어지게 한다.
   */
  it('퇴역한 도메인 조건은 어떤 모양이든 DNR 조건으로 실리지 않는다', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            mod('m1', 'X-Filled', {
              conditions: { initiatorDomains: ['  a.com  ', '', '   '], excludedDomains: [' skip.io ', ''] },
            }),
            mod('m2', 'X-Blank', {
              conditions: { initiatorDomains: ['  ', ''], excludedDomains: ['   '] },
            }),
          ],
        }),
      ],
      env,
    );

    const unconditional = { resourceTypes: [...ALL_RESOURCE_TYPES] };
    // 값이 들어 있어도 조건은 무조건과 **완전히** 같다 — 여분 키가 하나도 없다.
    expect(conditionOf(rules, 'X-Filled')).toEqual(unconditional);
    expect(conditionOf(rules, 'X-Blank')).toEqual(unconditional);
  });

  it('excludedDomains는 DNR로 내려가지 않는다 — allow 규칙도 만들지 않는다', () => {
    const { rules } = compile(
      [profile({ modifications: [mod('m1', 'X-A', { conditions: { excludedDomains: ['private.io'] } })] })],
      env,
    );

    expect(rules).toHaveLength(1);
    expect(rules[0]?.action.type).toBe('modifyHeaders');
    // 예전에는 네이티브 excludedRequestDomains가 됐다. 이제는 아무것도 되지 않는다.
    expect(rules[0]?.condition.excludedRequestDomains).toBeUndefined();
    expect(rules.some((r) => r.action.type === 'allow')).toBe(false);
  });

  it('조건은 자기 규칙에만 붙는다 — 시블링·다른 Profile 규칙은 무조건으로 남는다', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            mod('m1', 'X-Cond', { conditions: { excludedDomains: ['skip.io'], requestMethods: ['post'] } }),
            mod('m2', 'X-Sibling'),
          ],
        }),
        profile({ id: 'p2', modifications: [mod('b1', 'X-Other')] }),
      ],
      env,
    );

    expect(rules).toHaveLength(3);
    const unconditional = { resourceTypes: [...ALL_RESOURCE_TYPES] };
    expect(conditionOf(rules, 'X-Sibling')).toEqual(unconditional);
    expect(conditionOf(rules, 'X-Other')).toEqual(unconditional);
  });
});

describe('compile — 규칙 수 한도', () => {
  it('총 규칙 5,000 한도를 넘는 규칙은 제외되고 quota-exceeded 경고가 남는다', () => {
    const manyMods = Array.from({ length: 5001 }, (_, i) => mod(`m${i}`, `X-H-${i}`));
    const { rules, warnings } = compile([profile({ modifications: manyMods })], env);

    expect(rules.length).toBe(5000);
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'quota-exceeded', quota: 'total-rules' }),
    );
  });

  it('regex 규칙 1,000 한도를 넘으면 quota-exceeded(regex-rules) 경고가 남는다', () => {
    // 자체 urlFilter(regex) 규칙 1,001개 시도 → 1,000개까지만 방출된다
    const manyMods = Array.from({ length: 1001 }, (_, i) =>
      mod(`m${i}`, `X-H-${i}`, { urlFilter: 'example' }),
    );
    const { rules, warnings } = compile([profile({ modifications: manyMods })], env);

    expect(rules.length).toBe(1000);
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'quota-exceeded', quota: 'regex-rules' }),
    );
  });
});
