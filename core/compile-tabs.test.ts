import { describe, expect, it } from 'vitest';
import { compile, type TabInfo } from './compile';
import type { Filter, Modification, Profile } from './schema';

function mod(id: string, name: string): Modification {
  return { kind: 'request-header', id, name, value: 'v', enabled: true };
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

const TABS: TabInfo[] = [
  { tabId: 1, windowId: 10, groupId: -1, url: 'https://app.example.com/page' },
  { tabId: 2, windowId: 10, groupId: 5, url: 'https://sub.example.com/x' },
  { tabId: 3, windowId: 20, groupId: 5, url: 'https://other.com/' },
];

function env(overrides: Partial<Parameters<typeof compile>[1]> = {}) {
  return { paused: false, tabs: TABS, now: 1_000, materialized: {}, ...overrides };
}

const f = {
  tab: (tabId: number): Filter => ({ kind: 'tab', id: `t${tabId}`, enabled: true, tabId }),
  group: (groupId: number): Filter => ({ kind: 'tab-group', id: `g${groupId}`, enabled: true, groupId }),
  window: (windowId: number): Filter => ({ kind: 'window', id: `w${windowId}`, enabled: true, windowId }),
  tabDomain: (domain: string): Filter => ({ kind: 'tab-domain', id: `d-${domain}`, enabled: true, domain }),
  time: (expiresAt: number): Filter => ({ kind: 'time', id: `time`, enabled: true, expiresAt }),
};

describe('compile — 탭 계열 Filter의 tabIds 전개', () => {
  it('Tab Filter는 해당 탭 id로 전개된다', () => {
    const { rules } = compile([profile({ filters: [f.tab(2)] })], env());

    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition.tabIds).toEqual([2]);
  });

  it('Tab Group·Window Filter는 소속 탭들로 전개된다', () => {
    const byGroup = compile([profile({ filters: [f.group(5)] })], env());
    expect(byGroup.rules[0]?.condition.tabIds).toEqual([2, 3]);

    const byWindow = compile([profile({ filters: [f.window(10)] })], env());
    expect(byWindow.rules[0]?.condition.tabIds).toEqual([1, 2]);
  });

  it('Tab Domain Filter는 도메인(서브도메인 포함)이 일치하는 탭들로 전개된다', () => {
    const { rules } = compile([profile({ filters: [f.tabDomain('example.com')] })], env());

    expect(rules[0]?.condition.tabIds).toEqual([1, 2]);
  });

  it('같은 kind끼리 OR(합집합), 다른 kind끼리 AND(교집합)', () => {
    const union = compile([profile({ filters: [f.tab(1), f.tab(3)] })], env());
    expect(union.rules[0]?.condition.tabIds).toEqual([1, 3]);

    const intersect = compile(
      [profile({ filters: [f.group(5), f.window(10)] })],
      env(),
    );
    expect(intersect.rules[0]?.condition.tabIds).toEqual([2]);
  });

  it('매칭 탭이 없으면 그 Profile의 Modification 규칙을 내지 않는다 (탭 닫힘 자동 해제)', () => {
    const { rules } = compile([profile({ filters: [f.tab(99)] })], env());

    expect(rules).toEqual([]);
  });

  it('탭 계열 Filter가 없으면 tabIds 조건이 없다', () => {
    const { rules } = compile([profile()], env());

    expect(rules[0]?.condition.tabIds).toBeUndefined();
  });

  it('Exclude allow 규칙은 탭 조건과 무관하게 유지된다 (URL 단위 하향 전파 의미론)', () => {
    const { rules } = compile(
      [
        profile({
          filters: [
            f.tab(99), // 매칭 없음
            { kind: 'exclude-url', id: 'x', enabled: true, pattern: 'private' },
          ],
        }),
      ],
      env(),
    );

    expect(rules).toHaveLength(1);
    expect(rules[0]?.action.type).toBe('allow');
    expect(rules[0]?.condition.tabIds).toBeUndefined();
  });
});

describe('compile — 탭 상태 변화 추적', () => {
  it('탭이 그룹·창을 옮기면 다음 컴파일에서 tabIds가 따라간다', () => {
    const groupFilter = [f.group(5)];
    const before = compile([profile({ filters: groupFilter })], env());
    expect(before.rules[0]?.condition.tabIds).toEqual([2, 3]);

    // 탭 1이 그룹 5로 이동, 탭 3이 그룹에서 이탈한 새 스냅샷
    const moved: TabInfo[] = [
      { tabId: 1, windowId: 10, groupId: 5, url: 'https://app.example.com/page' },
      { tabId: 2, windowId: 10, groupId: 5, url: 'https://sub.example.com/x' },
      { tabId: 3, windowId: 20, groupId: -1, url: 'https://other.com/' },
    ];
    const after = compile([profile({ filters: groupFilter })], env({ tabs: moved }));
    expect(after.rules[0]?.condition.tabIds).toEqual([1, 2]);
  });

  it('미설정(UNSET_ID) 탭 계열 Filter는 무시된다 — 빈 패턴과 같은 fail-open', () => {
    const { rules } = compile(
      [profile({ filters: [{ kind: 'tab', id: 't', enabled: true, tabId: -1 }] })],
      env(),
    );

    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition.tabIds).toBeUndefined();
  });
});

describe('compile — Time Filter', () => {
  it('만료 전에는 규칙이 나오고, env.now가 만료를 지나면 나오지 않는다 (방어층)', () => {
    const before = compile([profile({ filters: [f.time(2_000)] })], env({ now: 1_000 }));
    expect(before.rules).toHaveLength(1);

    const after = compile([profile({ filters: [f.time(2_000)] })], env({ now: 2_000 }));
    expect(after.rules).toEqual([]);
  });

  it('disabled Time Filter는 만료를 일으키지 않는다', () => {
    const { rules } = compile(
      [profile({ filters: [{ kind: 'time', id: 't', enabled: false, expiresAt: 1 }] })],
      env({ now: 1_000 }),
    );

    expect(rules).toHaveLength(1);
  });
});
