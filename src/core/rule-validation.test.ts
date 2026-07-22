import { describe, expect, it } from 'vitest';
import { missingRequiredFields } from './rule-validation';
import type { Modification } from './schema';

const header = (over: Partial<Extract<Modification, { kind: 'request-header' }>> = {}): Modification => ({
  kind: 'request-header',
  id: 'm1',
  name: 'X-Test',
  value: 'v',
  enabled: true,
  mode: 'override',
  emptyMeans: 'remove',
  comment: '',
  ...over,
});

describe('missingRequiredFields — 저장되면 반드시 동작하는 규칙만 통과 (ui-refine 04)', () => {
  it('요청/응답 헤더는 이름이 필수 — 값은 비어도 유효(emptyMeans)', () => {
    expect(missingRequiredFields(header())).toEqual([]);
    expect(missingRequiredFields(header({ name: '' }))).toEqual(['name']);
    expect(missingRequiredFields(header({ name: '   ' }))).toEqual(['name']);
    expect(missingRequiredFields(header({ kind: 'response-header', name: '' } as never))).toEqual(['name']);
    expect(missingRequiredFields(header({ value: '' }))).toEqual([]);
  });

  it('요청 쿠키는 이름이 필수', () => {
    const cookie = { kind: 'cookie', id: 'c', name: '', value: 'x', enabled: true, mode: 'append', emptyMeans: 'remove', comment: '' } as const;
    expect(missingRequiredFields(cookie as Modification)).toEqual(['name']);
    expect(missingRequiredFields({ ...cookie, name: 'sid' } as Modification)).toEqual([]);
  });

  it('응답 쿠키는 빈 값이 유효(차단 사용례) — 필수 없음', () => {
    const setCookie = { kind: 'set-cookie', id: 's', value: '', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' } as const;
    expect(missingRequiredFields(setCookie as Modification)).toEqual([]);
  });

  it('CSP는 이름 있는 디렉티브가 최소 1개', () => {
    const csp = (directives: { name: string; value: string }[]): Modification =>
      ({ kind: 'csp', id: 'p', directives, enabled: true, comment: '' }) as Modification;
    expect(missingRequiredFields(csp([]))).toEqual(['directives']);
    expect(missingRequiredFields(csp([{ name: '', value: "'self'" }]))).toEqual(['directives']);
    expect(missingRequiredFields(csp([{ name: 'default-src', value: '' }]))).toEqual([]);
  });

  it('Redirect는 패턴·치환 둘 다 필수', () => {
    const redirect = (pattern: string, substitution: string): Modification =>
      ({ kind: 'redirect', id: 'r', pattern, substitution, enabled: true, comment: '' }) as Modification;
    expect(missingRequiredFields(redirect('', ''))).toEqual(['pattern', 'substitution']);
    expect(missingRequiredFields(redirect('^https://a/(.*)', ''))).toEqual(['substitution']);
    expect(missingRequiredFields(redirect('', 'https://b/\\1'))).toEqual(['pattern']);
    expect(missingRequiredFields(redirect('^https://a/(.*)', 'https://b/\\1'))).toEqual([]);
  });
});
