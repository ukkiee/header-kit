import { describe, expect, it } from 'vitest';
import { compile, type CompileEnv } from './compile';
import { placeholderTemplate, readStoredState, type Modification, type Profile } from './schema';

function profile(mods: Modification[]): Profile {
  return {
    id: 'p1',
    name: 'P',
    active: true,
    shortLabel: 'P',
    color: '#2563eb',
    modifications: mods,
  };
}

const env: CompileEnv = { paused: false, tabs: [], now: 0, materialized: {} };

describe('compile — Cookie', () => {
  it('append는 Cookie 요청 헤더에 name=value로 누적된다', () => {
    const { rules } = compile(
      [profile([{ kind: 'cookie', id: 'm1', name: 'session', value: 'abc', mode: 'append', emptyMeans: 'remove', comment: '', enabled: true }])],
      env,
    );

    expect(rules[0]?.action.requestHeaders?.[0]).toEqual({
      header: 'Cookie',
      operation: 'append',
      value: 'session=abc',
    });
  });

  it('override는 Cookie 헤더를 통째 교체한다', () => {
    const { rules } = compile(
      [profile([{ kind: 'cookie', id: 'm1', name: 'session', value: 'abc', mode: 'override', emptyMeans: 'remove', comment: '', enabled: true }])],
      env,
    );

    expect(rules[0]?.action.requestHeaders?.[0]).toEqual({
      header: 'Cookie',
      operation: 'set',
      value: 'session=abc',
    });
  });

  it('빈 값 + remove는 Cookie 헤더를 제거한다', () => {
    const { rules } = compile(
      [profile([{ kind: 'cookie', id: 'm1', name: 'session', value: '', mode: 'override', emptyMeans: 'remove', comment: '', enabled: true }])],
      env,
    );

    expect(rules[0]?.action.requestHeaders?.[0]).toEqual({ header: 'Cookie', operation: 'remove' });
  });
});

describe('compile — Set-Cookie', () => {
  it('append는 Set-Cookie 응답 헤더를 추가한다', () => {
    const { rules } = compile(
      [{ ...profile([]), modifications: [{ kind: 'set-cookie', id: 'm1', name: 'theme', value: 'dark', path: '/', mode: 'append', emptyMeans: 'remove', comment: '', enabled: true }] }],
      env,
    );

    expect(rules[0]?.action.responseHeaders?.[0]).toEqual({
      header: 'Set-Cookie',
      operation: 'append',
      value: 'theme=dark; Path=/',
    });
  });

  it('빈 값 + remove는 Set-Cookie를 차단(제거)한다', () => {
    const { rules } = compile(
      [{ ...profile([]), modifications: [{ kind: 'set-cookie', id: 'm1', name: '', value: '', mode: 'override', emptyMeans: 'remove', comment: '', enabled: true }] }],
      env,
    );

    expect(rules[0]?.action.responseHeaders?.[0]).toEqual({ header: 'Set-Cookie', operation: 'remove' });
  });
});

describe('compile — Redirect', () => {
  it('regex + 캡처 그룹 치환을 redirect 액션으로 컴파일한다', () => {
    const { rules } = compile(
      [
        profile([
          {
            kind: 'redirect',
            id: 'm1',
            pattern: '^https://prod\\.example\\.com/(.*)',
            substitution: 'http://localhost:3000/\\1',
            comment: '',
            enabled: true,
          },
        ]),
      ],
      env,
    );

    expect(rules).toHaveLength(1);
    expect(rules[0]?.action.type).toBe('redirect');
    expect(rules[0]?.action.redirect).toEqual({ regexSubstitution: 'http://localhost:3000/\\1' });
    expect(rules[0]?.condition.regexFilter).toBe('^https://prod\\.example\\.com/(.*)');
  });

  it('redirect도 자신의 conditions(메서드 등)를 DNR 조건에 싣는다', () => {
    const { rules } = compile(
      [
        profile([
          {
            kind: 'redirect',
            id: 'm1',
            pattern: 'example',
            substitution: 'https://local/\\0',
            comment: '',
            enabled: true,
            conditions: { requestMethods: ['get'] },
          },
        ]),
      ],
      env,
    );

    expect(rules[0]?.condition.requestMethods).toEqual(['get']);
  });

  it('빈 패턴은 규칙을 만들지 않는다', () => {
    const { rules } = compile(
      [profile([{ kind: 'redirect', id: 'm1', pattern: '', substitution: 'x', comment: '', enabled: true }])],
      env,
    );

    expect(rules).toEqual([]);
  });
});

describe('compile — Cookie Placeholder', () => {
  it('cookie 값의 Placeholder는 실체화 값을 소비한다', () => {
    const { rules } = compile(
      [profile([{ kind: 'cookie', id: 'm1', name: 'trace', value: '{{uuid}}', mode: 'append', emptyMeans: 'remove', comment: '', enabled: true }])],
      { ...env, materialized: { m1: 'real-uuid' } },
    );

    expect(rules[0]?.action.requestHeaders?.[0]?.value).toBe('trace=real-uuid');
  });
});

/**
 * 업그레이드 출력 보존 (티켓 01, ADR 0017) — **이 파일에서 가장 중요한 묶음이다.**
 *
 * v2에서 응답 쿠키는 `value`에 든 Set-Cookie 한 줄을 그대로 헤더로 내보냈다. v3는 그 필드의
 * 뜻을 바꾸므로, 업그레이드가 옳은지는 오직 하나로 판정된다 — **나가는 헤더가 같은가.**
 * 구조화로 갈라졌든 원시로 보존됐든 마찬가지여야 한다.
 */
describe('compile — v2 응답 쿠키 업그레이드 후 출력 보존', () => {
  const compileMigratedSetCookie = (v2Line: string) => {
    const read = readStoredState({
      schemaVersion: 2,
      paused: false,
      profiles: [
        {
          id: 'p1', name: 'P', active: true, shortLabel: 'P', color: '#2563eb',
          modifications: [
            { kind: 'set-cookie', id: 'm1', value: v2Line, enabled: true, mode: 'append', emptyMeans: 'remove', comment: '' },
          ],
        },
      ],
      materialized: {},
      customHeaderNames: [],
    });
    if (read.status !== 'migrated') throw new Error(`expected migrated, got ${read.status}`);
    const { rules } = compile(read.state.profiles, env);
    return rules[0]?.action.responseHeaders?.[0];
  };

  it.each([
    // 갈라지는 줄 — 조립기가 같은 글자를 되돌려 놓아야 한다.
    ['sid=abc'],
    ['sid=abc; Path=/'],
    ['sid=abc; Domain=localhost; Path=/; Max-Age=60; SameSite=None; Secure; HttpOnly'],
    ['theme=dark; SameSite=Lax'],
    ['t=1; Max-Age=-1'],
    // 갈라지지 않는 줄 — 원시 그대로 나가야 한다.
    ['sid=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT'],
    ['sid=a=b; Path=/'],
    ['sid=abc; Partitioned'],
    ['sid=abc; Secure; Path=/'], // 속성 순서가 조립 순서와 달라 원시로 남는다
  ])('%s 는 업그레이드 뒤에도 글자 그대로 나간다', (line) => {
    expect(compileMigratedSetCookie(line)).toEqual({
      header: 'Set-Cookie',
      operation: 'append',
      value: line,
    });
  });

  it('빈 값은 업그레이드 뒤에도 헤더를 제거한다', () => {
    const read = readStoredState({
      schemaVersion: 2,
      paused: false,
      profiles: [
        {
          id: 'p1', name: 'P', active: true, shortLabel: 'P', color: '#2563eb',
          modifications: [
            { kind: 'set-cookie', id: 'm1', value: '', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        },
      ],
      materialized: {},
      customHeaderNames: [],
    });
    if (read.status !== 'migrated') throw new Error('migrated가 아니다');
    const { rules } = compile(read.state.profiles, env);
    expect(rules[0]?.action.responseHeaders?.[0]).toEqual({ header: 'Set-Cookie', operation: 'remove' });
  });
});

/**
 * Placeholder × 응답 쿠키 (티켓 01 code-review, Spec 축).
 *
 * 실체화는 **`placeholderTemplate`이 가리키는 문자열**에 대해 일어나고 결과가 규칙 id 하나에
 * 저장된다. v3에서 나가는 줄이 그 문자열과 달라지면(원시 보존이면 raw가, 구조화면 조립된
 * 줄이 나간다) 컴파일이 엉뚱한 것을 소비한다 — 값이 통째로 빠지거나, 줄 전체가 uuid 하나로
 * 바뀐다. 업그레이드 전에는 둘 다 옳게 나갔으므로 이것은 회귀다.
 */
describe('compile — 응답 쿠키의 Placeholder', () => {
  const withMaterialized = (m: Modification, materialized: Record<string, string>) =>
    compile([{ ...profile([]), modifications: [m] }], { ...env, materialized });

  it('원시로 보존된 줄의 Placeholder가 실체화된 줄로 나간다', () => {
    const read = readStoredState({
      schemaVersion: 2,
      paused: false,
      profiles: [
        {
          id: 'p1', name: 'P', active: true, shortLabel: 'P', color: '#2563eb',
          modifications: [
            { kind: 'set-cookie', id: 'm1', value: 'sid={{uuid}}; Path=/', enabled: true, mode: 'append', emptyMeans: 'remove', comment: '' },
          ],
        },
      ],
      materialized: {},
      customHeaderNames: [],
    });
    if (read.status !== 'migrated') throw new Error('migrated가 아니다');
    const m = read.state.profiles[0]!.modifications[0]!;
    // 실체화가 무엇을 대상으로 삼는지가 이 회귀의 뿌리다 — 나가는 줄과 같아야 한다.
    expect(placeholderTemplate(m)).toBe('sid={{uuid}}; Path=/');

    const { rules } = withMaterialized(m, { m1: 'sid=REAL; Path=/' });
    expect(rules[0]?.action.responseHeaders?.[0]).toEqual({
      header: 'Set-Cookie',
      operation: 'append',
      value: 'sid=REAL; Path=/',
    });
  });

  it('구조화된 항목은 **값만** 실체화되고 줄은 그대로 조립된다', () => {
    const m: Modification = {
      kind: 'set-cookie', id: 'm1', name: 'sid', value: '{{uuid}}', path: '/',
      enabled: true, mode: 'append', emptyMeans: 'remove', comment: '',
    };
    expect(placeholderTemplate(m)).toBe('{{uuid}}');

    const { rules } = withMaterialized(m, { m1: 'REAL' });
    // 줄 전체가 uuid로 바뀌면 쿠키 이름과 Path가 사라진다.
    expect(rules[0]?.action.responseHeaders?.[0]).toEqual({
      header: 'Set-Cookie',
      operation: 'append',
      value: 'sid=REAL; Path=/',
    });
  });
});
