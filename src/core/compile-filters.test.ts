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
    shortLabel: 'P',
    color: '#2563eb',
    modifications: [mod('m1', 'X-A')],
    ...overrides,
  };
}

const env: CompileEnv = { paused: false, tabs: [], now: 0, materialized: {} };

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
    expect(rules[0]?.condition).toEqual({
      resourceTypes: ['xmlhttprequest'],
      requestMethods: ['post'],
      initiatorDomains: ['dev.example.com'],
      excludedRequestDomains: ['private.example.com'],
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

  it('도메인 조건은 트리밍되고 빈 문자열은 걸러진다 — 전부 비면 조건 없음과 같다', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            mod('m1', 'X-Trim', {
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

    const trimmed = conditionOf(rules, 'X-Trim');
    expect(trimmed?.initiatorDomains).toEqual(['a.com']);
    expect(trimmed?.excludedRequestDomains).toEqual(['skip.io']);
    const blank = conditionOf(rules, 'X-Blank');
    expect(blank?.initiatorDomains).toBeUndefined();
    expect(blank?.excludedRequestDomains).toBeUndefined();
  });

  it('excludedDomains는 네이티브 excludedRequestDomains가 된다 — allow 규칙은 만들지 않는다', () => {
    const { rules } = compile(
      [profile({ modifications: [mod('m1', 'X-A', { conditions: { excludedDomains: ['private.io'] } })] })],
      env,
    );

    expect(rules).toHaveLength(1);
    expect(rules[0]?.action.type).toBe('modifyHeaders');
    expect(rules[0]?.condition.excludedRequestDomains).toEqual(['private.io']);
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
