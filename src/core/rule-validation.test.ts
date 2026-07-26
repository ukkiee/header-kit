import { describe, expect, it } from 'vitest';
import { fieldIssues, type FieldIssue, type RequiredField } from './rule-validation';
import type { Modification } from './schema';

const required = (field: RequiredField): FieldIssue => ({ field, reason: 'required' });

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

describe('fieldIssues — 저장되면 반드시 동작하는 규칙만 통과 (ui-refine 04)', () => {
  it('요청/응답 헤더는 이름이 필수 — 값은 비어도 유효(emptyMeans)', () => {
    expect(fieldIssues(header())).toEqual([]);
    expect(fieldIssues(header({ name: '' }))).toEqual([required('name')]);
    expect(fieldIssues(header({ name: '   ' }))).toEqual([required('name')]);
    expect(fieldIssues(header({ kind: 'response-header', name: '' } as never))).toEqual([required('name')]);
    expect(fieldIssues(header({ value: '' }))).toEqual([]);
  });

  it('요청 쿠키는 이름이 필수', () => {
    const cookie = { kind: 'cookie', id: 'c', name: '', value: 'x', enabled: true, mode: 'append', emptyMeans: 'remove', comment: '' } as const;
    expect(fieldIssues(cookie as Modification)).toEqual([required('name')]);
    expect(fieldIssues({ ...cookie, name: 'sid' } as Modification)).toEqual([]);
  });

  it('응답 쿠키는 빈 값이 유효(차단 사용례) — 필수 없음', () => {
    const setCookie = { kind: 'set-cookie', id: 's', value: '', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' } as const;
    expect(fieldIssues(setCookie as Modification)).toEqual([]);
  });

  it('Redirect는 패턴·치환 둘 다 필수', () => {
    const redirect = (pattern: string, substitution: string): Modification =>
      ({ kind: 'redirect', id: 'r', pattern, substitution, enabled: true, comment: '' }) as Modification;
    expect(fieldIssues(redirect('', ''))).toEqual([required('pattern'), required('substitution')]);
    expect(fieldIssues(redirect('^https://a/(.*)', ''))).toEqual([required('substitution')]);
    expect(fieldIssues(redirect('', 'https://b/\\1'))).toEqual([required('pattern')]);
    expect(fieldIssues(redirect('^https://a/(.*)', 'https://b/\\1'))).toEqual([]);
  });
});
