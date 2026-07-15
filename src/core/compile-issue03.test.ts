import { describe, expect, it } from 'vitest';
import { compile, type CompileEnv } from './compile';
import type { Modification, Profile } from './schema';

function profile(mods: Modification[]): Profile {
  return {
    id: 'p1',
    name: 'P',
    active: true,
    shortLabel: 'P',
    color: '#2563eb',
    modifications: mods,
    filters: [],
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
      [{ ...profile([]), modifications: [{ kind: 'set-cookie', id: 'm1', value: 'theme=dark; Path=/', mode: 'append', emptyMeans: 'remove', comment: '', enabled: true }] }],
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
      [{ ...profile([]), modifications: [{ kind: 'set-cookie', id: 'm1', value: '', mode: 'override', emptyMeans: 'remove', comment: '', enabled: true }] }],
      env,
    );

    expect(rules[0]?.action.responseHeaders?.[0]).toEqual({ header: 'Set-Cookie', operation: 'remove' });
  });
});

describe('compile — CSP', () => {
  it('디렉티브를 합성해 Content-Security-Policy 응답 헤더로 set 한다', () => {
    const { rules } = compile(
      [
        profile([
          {
            kind: 'csp',
            id: 'm1',
            directives: [
              { name: 'default-src', value: "'self'" },
              { name: 'img-src', value: '*' },
            ],
            comment: '',
            enabled: true,
          },
        ]),
      ],
      env,
    );

    expect(rules[0]?.action.responseHeaders?.[0]).toEqual({
      header: 'Content-Security-Policy',
      operation: 'set',
      value: "default-src 'self'; img-src *",
    });
  });

  it('빈 디렉티브는 규칙을 만들지 않는다', () => {
    const { rules } = compile(
      [profile([{ kind: 'csp', id: 'm1', directives: [], comment: '', enabled: true }])],
      env,
    );

    expect(rules).toEqual([]);
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

  it('redirect는 소유 Profile의 나머지 필터(메서드 등)를 상속한다', () => {
    const { rules } = compile(
      [
        {
          ...profile([
            {
              kind: 'redirect',
              id: 'm1',
              pattern: 'example',
              substitution: 'https://local/\\0',
              comment: '',
              enabled: true,
            },
          ]),
          filters: [{ kind: 'request-method', id: 'f1', enabled: true, methods: ['get'] }],
        },
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
