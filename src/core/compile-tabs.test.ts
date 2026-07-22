import { describe, expect, it } from 'vitest';
import { compile, type TabInfo } from './compile';
import type { Modification, Profile, RuleConditions } from './schema';

function mod(id: string, name: string, conditions?: RuleConditions): Modification {
  return { kind: 'request-header', id, name, value: 'v', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '', ...(conditions !== undefined ? { conditions } : {}) };
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

const TABS: TabInfo[] = [
  { tabId: 1, url: 'https://example.com/page' },
  { tabId: 2, url: 'https://sub.example.com/x' },
  { tabId: 3, url: 'https://other.com/' },
  { tabId: 4, url: 'https://notexample.com/' },
  { tabId: 5 }, // url 미상 탭 (권한 없음 등)
];

function env(overrides: Partial<Parameters<typeof compile>[1]> = {}) {
  return { paused: false, tabs: TABS, now: 1_000, materialized: {}, ...overrides };
}

function emittedHeaders(rules: ReturnType<typeof compile>['rules']): (string | undefined)[] {
  return rules.map((r) => r.action.requestHeaders?.[0]?.header);
}

describe('compile — 규칙 tabDomains 조건의 tabIds 전개 (ADR 0010)', () => {
  it('tabDomains는 도메인(서브도메인 포함)이 일치하는 탭들로 전개된다', () => {
    const { rules } = compile(
      [profile({ modifications: [mod('m1', 'X-A', { tabDomains: ['example.com'] })] })],
      env(),
    );

    expect(rules).toHaveLength(1);
    // notexample.com(탭 4)은 접미사만 겹칠 뿐 서브도메인이 아니므로 매칭되지 않는다.
    expect(rules[0]?.condition.tabIds).toEqual([1, 2]);
  });

  it('여러 도메인은 OR(합집합)로 전개된다', () => {
    const { rules } = compile(
      [profile({ modifications: [mod('m1', 'X-A', { tabDomains: ['example.com', 'other.com'] })] })],
      env(),
    );

    expect(rules[0]?.condition.tabIds).toEqual([1, 2, 3]);
  });

  it('url을 모르는 탭은 어떤 도메인에도 매칭되지 않는다', () => {
    const urlless: TabInfo[] = [{ tabId: 5 }];
    const { rules } = compile(
      [profile({ modifications: [mod('m1', 'X-A', { tabDomains: ['example.com'] })] })],
      env({ tabs: urlless }),
    );

    expect(rules).toEqual([]);
  });

  it('매칭 탭이 없으면 그 규칙만 방출되지 않는다 — 같은 프로필의 다른 규칙은 나온다 (탭 닫힘 자동 해제)', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            mod('m1', 'X-A', { tabDomains: ['closed.dev'] }), // 매칭 없음
            mod('m2', 'X-B'),
          ],
        }),
      ],
      env(),
    );

    expect(emittedHeaders(rules)).toEqual(['X-B']);
    expect(rules[0]?.condition.tabIds).toBeUndefined();
  });

  it('tabDomains 조건이 없으면 tabIds 조건도 없다', () => {
    const { rules } = compile([profile()], env());

    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition.tabIds).toBeUndefined();
  });

  it('빈 배열·공백뿐인 tabDomains는 조건 없음으로 취급된다 — 빈 패턴과 같은 fail-open', () => {
    const { rules } = compile(
      [
        profile({
          modifications: [
            mod('m1', 'X-A', { tabDomains: [] }),
            mod('m2', 'X-B', { tabDomains: ['  ', ''] }),
          ],
        }),
      ],
      env(),
    );

    expect(emittedHeaders(rules)).toEqual(['X-A', 'X-B']);
    expect(rules.every((r) => r.condition.tabIds === undefined)).toBe(true);
  });
});

describe('compile — 탭 상태 변화 추적', () => {
  it('탭이 다른 도메인으로 이동하면 다음 컴파일에서 tabIds가 따라간다', () => {
    const modifications = [mod('m1', 'X-A', { tabDomains: ['example.com'] })];
    const before = compile([profile({ modifications })], env());
    expect(before.rules[0]?.condition.tabIds).toEqual([1, 2]);

    // 탭 3이 example.com으로 이동, 탭 1은 다른 도메인으로 이탈한 새 스냅샷
    const moved: TabInfo[] = [
      { tabId: 1, url: 'https://elsewhere.io/' },
      { tabId: 2, url: 'https://sub.example.com/x' },
      { tabId: 3, url: 'https://example.com/in' },
    ];
    const after = compile([profile({ modifications })], env({ tabs: moved }));
    expect(after.rules[0]?.condition.tabIds).toEqual([2, 3]);
  });
});
