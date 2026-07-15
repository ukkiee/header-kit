import { describe, expect, it } from 'vitest';
import { compile, REGEX_JOIN_LIMIT } from './compile';
import type { Filter, Modification, Profile } from './schema';

function mod(id: string, name: string): Modification {
  return { kind: 'request-header', id, name, value: 'v', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'P',
    active: true,
    shortLabel: 'P',
    color: '#2563eb',
    modifications: [mod('m1', 'X-A')],
    filters: [],
    ...overrides,
  };
}

describe('compile — Filter 조건 합성', () => {
  it('URL Filter는 regexFilter로, 복수 등록은 OR-join으로 합성된다', () => {
    const { rules } = compile(
      [
        profile({
          filters: [
            { kind: 'url', id: 'f1', enabled: true, pattern: 'api\\.a\\.com' },
            { kind: 'url', id: 'f2', enabled: true, pattern: 'api\\.b\\.com' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition.regexFilter).toBe('(?:api\\.a\\.com)|(?:api\\.b\\.com)');
  });

  it('다른 종류 Filter끼리는 AND — 한 규칙의 조건 필드로 함께 실린다', () => {
    const { rules } = compile(
      [
        profile({
          filters: [
            { kind: 'url', id: 'f1', enabled: true, pattern: 'example' },
            { kind: 'resource-type', id: 'f2', enabled: true, resourceTypes: ['xmlhttprequest'] },
            { kind: 'request-method', id: 'f3', enabled: true, methods: ['post'] },
            { kind: 'initiator-domain', id: 'f4', enabled: true, domain: 'dev.example.com' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(rules[0]?.condition).toEqual({
      regexFilter: '(?:example)',
      resourceTypes: ['xmlhttprequest'],
      requestMethods: ['post'],
      initiatorDomains: ['dev.example.com'],
    });
  });

  it('같은 종류의 집합형 Filter는 합집합으로 OR 된다', () => {
    const { rules } = compile(
      [
        profile({
          filters: [
            { kind: 'resource-type', id: 'f1', enabled: true, resourceTypes: ['script'] },
            { kind: 'resource-type', id: 'f2', enabled: true, resourceTypes: ['stylesheet', 'script'] },
            { kind: 'initiator-domain', id: 'f3', enabled: true, domain: 'a.com' },
            { kind: 'initiator-domain', id: 'f4', enabled: true, domain: 'b.com' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(rules[0]?.condition.resourceTypes).toEqual(['script', 'stylesheet']);
    expect(rules[0]?.condition.initiatorDomains).toEqual(['a.com', 'b.com']);
  });

  it('disabled Filter와 빈 패턴은 무시된다', () => {
    const { rules } = compile(
      [
        profile({
          filters: [
            { kind: 'url', id: 'f1', enabled: false, pattern: 'never' },
            { kind: 'url', id: 'f2', enabled: true, pattern: '  ' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(rules[0]?.condition.regexFilter).toBeUndefined();
  });

  it('Exclude URL Filter는 자기 대역 상단의 allow 규칙이 된다', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [mod('m1', 'X-A'), mod('m2', 'X-B')],
          filters: [{ kind: 'exclude-url', id: 'f1', enabled: true, pattern: 'private' }],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    const allow = rules.find((r) => r.action.type === 'allow');
    const mods = rules.filter((r) => r.action.type === 'modifyHeaders');
    expect(allow).toBeDefined();
    expect(allow?.condition.regexFilter).toBe('(?:private)');
    // allow는 자기 Profile의 모든 Modification 규칙보다 높다 (대역 상단 슬롯)
    for (const rule of mods) {
      expect(allow!.priority).toBeGreaterThan(rule.priority);
    }
  });

  it('Exclude allow는 아래(낮은 우선순위) Profile 규칙보다도 높다 — 하향 전파 의미론', () => {
    const { rules } = compile(
      [
        profile({
          id: 'top',
          filters: [{ kind: 'exclude-url', id: 'f1', enabled: true, pattern: 'private' }],
        }),
        profile({ id: 'bottom', modifications: [mod('b1', 'X-B')] }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    const allow = rules.find((r) => r.action.type === 'allow')!;
    const bottomRule = rules.find(
      (r) => r.action.requestHeaders?.[0]?.header === 'X-B',
    )!;
    expect(allow.priority).toBeGreaterThan(bottomRule.priority);
  });

  it('URL Filter OR-join이 길이 한도를 넘으면 규칙을 분할한다', () => {
    const longA = 'a'.repeat(Math.ceil(REGEX_JOIN_LIMIT * 0.6));
    const longB = 'b'.repeat(Math.ceil(REGEX_JOIN_LIMIT * 0.6));
    const { rules, warnings } = compile(
      [
        profile({
          filters: [
            { kind: 'url', id: 'f1', enabled: true, pattern: longA },
            { kind: 'url', id: 'f2', enabled: true, pattern: longB },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(warnings).toEqual([]);
    expect(rules).toHaveLength(2);
    expect(rules[0]?.condition.regexFilter).toBe(`(?:${longA})`);
    expect(rules[1]?.condition.regexFilter).toBe(`(?:${longB})`);
    // 분할된 규칙은 같은 Modification이므로 같은 priority를 공유한다
    expect(rules[0]?.priority).toBe(rules[1]?.priority);
  });

  it('단일 패턴이 한도를 넘으면 건너뛰고 regex-too-long 경고를 반환한다', () => {
    const tooLong = 'x'.repeat(REGEX_JOIN_LIMIT + 1);
    const { rules, warnings } = compile(
      [
        profile({
          filters: [
            { kind: 'url', id: 'f-long', enabled: true, pattern: tooLong },
            { kind: 'url', id: 'f-ok', enabled: true, pattern: 'fine' },
          ],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'regex-too-long', profileId: 'p1', filterId: 'f-long' }),
    );
    expect(rules[0]?.condition.regexFilter).toBe('(?:fine)');
  });

  it('총 규칙 5,000 한도를 넘는 규칙은 제외되고 quota-exceeded 경고가 남는다', () => {
    const manyMods = Array.from({ length: 5001 }, (_, i) => mod(`m${i}`, `X-H-${i}`));
    const { rules, warnings } = compile([profile({ modifications: manyMods })], {
      paused: false,
      tabs: [],
      now: 0,
      materialized: {},
    });

    expect(rules.length).toBe(5000);
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'quota-exceeded', quota: 'total-rules' }),
    );
  });

  it('regex 규칙 1,000 한도를 넘으면 quota-exceeded(regex-rules) 경고가 남는다', () => {
    // 한 Profile: url filter 1개 × Modification 1,001개 → regex 규칙 1,001개 시도
    const manyMods = Array.from({ length: 1001 }, (_, i) => mod(`m${i}`, `X-H-${i}`));
    const { rules, warnings } = compile(
      [
        profile({
          modifications: manyMods,
          filters: [{ kind: 'url', id: 'f1', enabled: true, pattern: 'example' }],
        }),
      ],
      { paused: false, tabs: [], now: 0, materialized: {} },
    );

    expect(rules.length).toBe(1000);
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'quota-exceeded', quota: 'regex-rules' }),
    );
  });
});
