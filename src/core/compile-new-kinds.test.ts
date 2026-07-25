import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { createModification, createProfile, type Modification, type Profile } from './schema';

/**
 * User-Agent·Header Removal 종류의 컴파일 계약 (티켓 03, ADR 0015).
 *
 * 두 종류가 실제로 브라우저 규칙으로 어떻게 떨어지는지를 못박는다 — 폼이 무엇을 보여
 * 주는지가 아니라, 켰을 때 트래픽에 무슨 일이 일어나는지가 계약이다.
 */

const withRules = (modifications: Modification[]): Profile => ({
  ...createProfile('T'),
  active: true,
  modifications,
});

const compileOne = (m: Modification) =>
  compile([withRules([m])], { paused: false, tabs: [], now: 0, materialized: {} });

describe('User-Agent 종류', () => {
  it('User-Agent 요청 헤더를 값으로 덮어쓴다', () => {
    const ua = { ...createModification('user-agent'), value: 'Mozilla/5.0 (Test)' } as Modification;
    const { rules } = compileOne(ua);
    expect(rules).toHaveLength(1);
    const action = rules[0]?.action;
    expect(action?.type).toBe('modifyHeaders');
    expect(action?.requestHeaders).toEqual([
      { header: 'User-Agent', operation: 'set', value: 'Mozilla/5.0 (Test)' },
    ]);
    // 응답 헤더는 건드리지 않는다 — UA는 요청 쪽 개념이다.
    expect(action?.responseHeaders).toBeUndefined();
  });

  it('헤더 이름은 고정이라 사용자가 비워도 이름 누락 경고가 나지 않는다', () => {
    const ua = { ...createModification('user-agent'), value: 'UA' } as Modification;
    const { warnings } = compileOne(ua);
    expect(warnings.filter((w) => w.code === 'empty-header-name')).toEqual([]);
  });
});

describe('Header Removal 종류', () => {
  it('같은 이름의 헤더를 요청·응답 **양쪽에서** 제거한다', () => {
    const del = { ...createModification('header-removal'), name: 'X-Frame-Options' } as Modification;
    const { rules } = compileOne(del);
    expect(rules).toHaveLength(1);
    const action = rules[0]?.action;
    expect(action?.type).toBe('modifyHeaders');
    // 디자인이 req/res를 구분하지 않는 한 종류로 두었으므로, 규칙 하나가 둘 다 낸다.
    expect(action?.requestHeaders).toEqual([{ header: 'X-Frame-Options', operation: 'remove' }]);
    expect(action?.responseHeaders).toEqual([{ header: 'X-Frame-Options', operation: 'remove' }]);
  });

  it('이름이 비면 방출하지 않고 경고한다 — 모든 헤더를 지우는 사고를 막는다', () => {
    const del = { ...createModification('header-removal'), name: '  ' } as Modification;
    const { rules, warnings } = compileOne(del);
    expect(rules).toEqual([]);
    expect(warnings.some((w) => w.code === 'empty-header-name')).toBe(true);
  });
});

describe('두 종류 모두 기존 조건 체계를 그대로 탄다', () => {
  it('URL 스코프와 조건이 규칙에 실린다', () => {
    const ua = {
      ...createModification('user-agent'),
      value: 'UA',
      urlFilter: 'example.com',
      urlMatchType: 'domain',
      conditions: { requestMethods: ['post'] },
    } as Modification;
    const { rules } = compileOne(ua);
    expect(rules[0]?.condition.requestMethods).toEqual(['post']);
    // domain 매치는 DNR 비정규식 문법으로 떨어진다(regex 한도를 쓰지 않는다, ADR 0008).
    expect(rules[0]?.condition.urlFilter).toBe('||example.com');
  });
});
