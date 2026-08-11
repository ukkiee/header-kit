import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { fieldIssues } from './rule-validation';
import {
  createDefaultState,
  createModification,
  createProfile,
  parseStoredState,
  type Modification,
  type Profile,
} from './schema';
import { exportProfiles, parseImport } from './transfer';

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

const compileOne = (m: Modification) => compile([withRules([m])], { paused: false, materialized: {} });

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

describe('겹침 경고는 헤더를 만지는 모든 종류를 본다', () => {
  const twoProfiles = (a: Modification, b: Modification) =>
    compile(
      [
        { ...createProfile('A'), id: 'pa', active: true, modifications: [a] },
        { ...createProfile('B'), id: 'pb', active: true, modifications: [b] },
      ],
      { paused: false, materialized: {} },
    );

  it('두 프로필이 함께 UA를 바꾸면 겹침으로 알린다', () => {
    const ua = () => ({ ...createModification('user-agent'), value: 'X' }) as Modification;
    const { warnings } = twoProfiles(ua(), ua());
    expect(warnings.some((w) => w.code === 'header-overlap')).toBe(true);
  });

  it('UA 종류와 이름이 User-Agent인 요청 헤더도 서로 겹친다 — 표현이 달라도 같은 헤더다', () => {
    const ua = { ...createModification('user-agent'), value: 'X' } as Modification;
    const raw = {
      ...createModification('request-header'),
      name: 'user-agent',
      value: 'Y',
    } as Modification;
    const { warnings } = twoProfiles(ua, raw);
    expect(warnings.some((w) => w.code === 'header-overlap')).toBe(true);
  });

  it('한쪽이 지우고 한쪽이 설정해도 겹침이다', () => {
    const del = { ...createModification('header-removal'), name: 'X-Foo' } as Modification;
    const set = {
      ...createModification('response-header'),
      name: 'X-Foo',
      value: '1',
    } as Modification;
    const { warnings } = twoProfiles(del, set);
    expect(warnings.some((w) => w.code === 'header-overlap')).toBe(true);
  });

  it('서로 다른 헤더는 겹치지 않는다', () => {
    const a = { ...createModification('header-removal'), name: 'X-A' } as Modification;
    const b = { ...createModification('header-removal'), name: 'X-B' } as Modification;
    const { warnings } = twoProfiles(a, b);
    expect(warnings.some((w) => w.code === 'header-overlap')).toBe(false);
  });
});

describe('검증·영속 계약', () => {
  it('UA는 값이 필수다 — 비면 UA를 빈 문자열로 보내는 사고가 된다', () => {
    expect(fieldIssues({ ...createModification('user-agent'), value: '' } as Modification)).toEqual([
      { field: 'value', reason: 'required' },
    ]);
    expect(fieldIssues({ ...createModification('user-agent'), value: 'X' } as Modification)).toEqual([]);
  });

  it('Header Removal은 이름이 필수다', () => {
    expect(fieldIssues({ ...createModification('header-removal'), name: ' ' } as Modification)).toEqual([
      { field: 'name', reason: 'required' },
    ]);
    expect(fieldIssues({ ...createModification('header-removal'), name: 'X-Foo' } as Modification)).toEqual(
      [],
    );
  });

  it('두 종류가 저장→로드 왕복에서 살아남는다 — 검증 실패는 상태 전체를 기본값으로 리셋한다', () => {
    const state = {
      ...createDefaultState(),
      profiles: [
        {
          ...createProfile('P'),
          id: 'p1',
          modifications: [
            { ...createModification('user-agent', 'u1'), value: 'Mozilla/5.0' },
            { ...createModification('header-removal', 'd1'), name: 'X-Frame-Options' },
          ] as Modification[],
        },
      ],
    };
    const revived = parseStoredState(JSON.parse(JSON.stringify(state)));
    expect(revived.profiles[0]?.modifications.map((m) => m.kind)).toEqual(['user-agent', 'header-removal']);
    // 새 종류에는 뜻 없는 mode/emptyMeans가 붙지 않는다.
    expect(revived.profiles[0]?.modifications[0]).not.toHaveProperty('mode');
  });

  it('두 종류가 내보내기→가져오기 왕복에서 살아남는다', () => {
    const profile = {
      ...createProfile('P'),
      id: 'p1',
      modifications: [
        { ...createModification('user-agent', 'u1'), value: 'UA' },
        { ...createModification('header-removal', 'd1'), name: 'X-Foo' },
      ] as Modification[],
    };
    const file = exportProfiles({ ...createDefaultState(), profiles: [profile] }, ['p1']);
    const result = parseImport(JSON.stringify(file));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profiles[0]?.modifications.map((m) => m.kind)).toEqual(['user-agent', 'header-removal']);
    }
  });
});
