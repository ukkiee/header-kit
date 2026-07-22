import { describe, expect, it } from 'vitest';
import { compile, type CompileEnv } from './compile';
import type { Modification, Profile } from './schema';

function header(overrides: Partial<Modification> & { id: string; name: string }): Modification {
  return {
    kind: 'request-header',
    value: 'v',
    mode: 'override',
    emptyMeans: 'remove',
    comment: '',
    enabled: true,
    ...overrides,
  } as Modification;
}

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

describe('compile — 헤더 target / mode / empty', () => {
  it('request-header는 requestHeaders로, response-header는 responseHeaders로 간다', () => {
    const { rules } = compile(
      [
        profile([
          header({ id: 'm1', name: 'X-Req', value: '1' }),
          header({ kind: 'response-header', id: 'm2', name: 'X-Res', value: '2', mode: 'override', emptyMeans: 'remove', comment: '' }),
        ]),
      ],
      env,
    );

    const req = rules.find((r) => r.action.requestHeaders);
    const res = rules.find((r) => r.action.responseHeaders);
    expect(req?.action.requestHeaders?.[0]).toEqual({ header: 'X-Req', operation: 'set', value: '1' });
    expect(res?.action.responseHeaders?.[0]).toEqual({ header: 'X-Res', operation: 'set', value: '2' });
  });

  it('빈 값 + remove는 헤더 제거 연산(값 없음)으로 컴파일된다', () => {
    const { rules } = compile(
      [profile([header({ id: 'm1', name: 'X-Gone', value: '', emptyMeans: 'remove' })])],
      env,
    );

    expect(rules[0]?.action.requestHeaders?.[0]).toEqual({ header: 'X-Gone', operation: 'remove' });
  });

  it('빈 값 + send-empty는 빈 문자열 set으로 컴파일된다', () => {
    const { rules } = compile(
      [profile([header({ id: 'm1', name: 'X-Empty', value: '', emptyMeans: 'send-empty' })])],
      env,
    );

    expect(rules[0]?.action.requestHeaders?.[0]).toEqual({
      header: 'X-Empty',
      operation: 'set',
      value: '',
    });
  });

  it('비지 않은 값에서는 emptyMeans가 무시된다', () => {
    const { rules } = compile(
      [profile([header({ id: 'm1', name: 'X-A', value: 'x', emptyMeans: 'remove' })])],
      env,
    );

    expect(rules[0]?.action.requestHeaders?.[0]).toEqual({ header: 'X-A', operation: 'set', value: 'x' });
  });

  it('허용 목록 요청 헤더의 append는 append 연산으로 컴파일된다', () => {
    const { rules } = compile(
      [profile([header({ id: 'm1', name: 'Accept', value: 'application/json', mode: 'append' })])],
      env,
    );

    expect(rules[0]?.action.requestHeaders?.[0]).toEqual({
      header: 'Accept',
      operation: 'append',
      value: 'application/json',
    });
  });

  it('허용 목록 밖 요청 헤더의 append는 set으로 폴백하고 경고를 남긴다', () => {
    const { rules, warnings } = compile(
      [profile([header({ id: 'm1', name: 'X-Custom', value: 'v', mode: 'append' })])],
      env,
    );

    expect(rules[0]?.action.requestHeaders?.[0]?.operation).toBe('set');
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'append-not-allowed', modificationId: 'm1' }),
    );
  });

  it('응답 헤더 append는 허용 목록 제약이 없다', () => {
    const { rules, warnings } = compile(
      [
        profile([
          header({ kind: 'response-header', id: 'm1', name: 'X-Custom', value: 'v', mode: 'append' }),
        ]),
      ],
      env,
    );

    expect(rules[0]?.action.responseHeaders?.[0]?.operation).toBe('append');
    expect(warnings).toEqual([]);
  });

  it('Append 누적: 같은 요청 헤더를 여러 append하면 우선순위 순으로 쌓인다 (이슈 04 이연분)', () => {
    const { rules } = compile(
      [
        profile([
          header({ id: 'm1', name: 'Accept', value: 'first', mode: 'append' }),
          header({ id: 'm2', name: 'Accept', value: 'second', mode: 'append' }),
        ]),
      ],
      env,
    );

    // 목록 앞 항목이 더 높은 priority — DNR가 높은 priority부터 적용해 순서대로 누적
    const [r1, r2] = rules;
    expect(r1?.action.requestHeaders?.[0]).toMatchObject({ operation: 'append', value: 'first' });
    expect(r2?.action.requestHeaders?.[0]).toMatchObject({ operation: 'append', value: 'second' });
    expect(r1!.priority).toBeGreaterThan(r2!.priority);
  });
});
