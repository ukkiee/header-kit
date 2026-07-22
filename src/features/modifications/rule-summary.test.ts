import { describe, expect, it } from 'vitest';
import { makeTranslator } from '@/core/i18n';
import type { Modification } from '@/core/schema';
import { ruleView } from './rule-summary';

const t = makeTranslator('en');
const ko = makeTranslator('ko');

const header = (over: Partial<Extract<Modification, { kind: 'request-header' }>> = {}): Modification => ({
  kind: 'request-header',
  id: 'm1',
  name: 'X-Test',
  value: 'aaa',
  enabled: true,
  mode: 'override',
  emptyMeans: 'remove',
  comment: '',
  ...over,
});

describe('ruleView', () => {
  it('헤더 규칙: 제목=메모 우선(없으면 헤더 이름), 요약=이름: 값', () => {
    expect(ruleView(header({ comment: 'test' }), t)).toEqual({
      title: 'test',
      badge: 'REQ',
      summary: 'X-Test: aaa',
      conditionBadges: [],
    });
    expect(ruleView(header(), t).title).toBe('X-Test');
  });

  it('응답/쿠키/Set-Cookie 배지', () => {
    expect(ruleView(header({ kind: 'response-header' } as never), t).badge).toBe('RES');
    expect(
      ruleView({ kind: 'cookie', id: 'c', name: 'sid', value: 'x', enabled: true, mode: 'append', emptyMeans: 'remove', comment: '' }, t).badge,
    ).toBe('COOKIE');
    const setCookie = ruleView(
      { kind: 'set-cookie', id: 's', value: 'theme=dark; Path=/', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
      t,
    );
    expect(setCookie.badge).toBe('SET-COOKIE');
    expect(setCookie.summary).toBe('theme=dark; Path=/');
    expect(setCookie.title).toBe('SET-COOKIE');
  });

  it('append 모드는 요약에 표기된다 (지역화)', () => {
    const m = header({ mode: 'append' });
    expect(ruleView(m, t).summary).toBe('X-Test: aaa (Append)');
    expect(ruleView(m, ko).summary).toBe('X-Test: aaa (덧붙이기)');
  });

  it('빈 값은 emptyMeans를 지역화해 표기한다', () => {
    expect(ruleView(header({ value: '' }), t).summary).toBe('X-Test: (Remove)');
    expect(ruleView(header({ value: '', emptyMeans: 'send-empty' }), ko).summary).toBe('X-Test: (빈 값 전송)');
  });

  it('CSP: 디렉티브 나열 요약', () => {
    const view = ruleView(
      {
        kind: 'csp',
        id: 'p',
        directives: [
          { name: 'default-src', value: "'self'" },
          { name: 'img-src', value: 'data:' },
        ],
        enabled: true,
        comment: '',
      },
      t,
    );
    expect(view).toEqual({ title: 'CSP', badge: 'CSP', summary: "default-src 'self' · img-src data:", conditionBadges: [] });
  });

  it('리다이렉트: 패턴 → 치환 요약, 메모가 제목', () => {
    const view = ruleView(
      {
        kind: 'redirect',
        id: 'r',
        pattern: '^https://a/(.*)',
        substitution: 'https://b/\\1',
        enabled: true,
        comment: 'to staging',
      },
      t,
    );
    expect(view).toEqual({
      title: 'to staging',
      badge: 'REDIRECT',
      summary: '^https://a/(.*) → https://b/\\1',
      conditionBadges: [],
    });
  });

  it('규칙 자신의 urlFilter가 요약 앞에 붙는다 (ADR 0007)', () => {
    expect(
      ruleView(header({ comment: 'test', name: 'x-test', value: 'aaa', urlFilter: 'imtest.me/' }), t).summary,
    ).toBe('imtest.me/ → x-test: aaa');
    expect(ruleView(header(), t).summary).toBe('X-Test: aaa');
    expect(ruleView(header({ urlFilter: '  ' }), t).summary).toBe('X-Test: aaa');
  });

  it('조건 없으면 conditionBadges는 빈 배열 — 요약은 순수 효과만 (ui-refine 05)', () => {
    const view = ruleView(header(), t);
    expect(view.summary).toBe('X-Test: aaa');
    expect(view.conditionBadges).toEqual([]);
  });

  it('조건은 요약이 아니라 배지 줄로 나온다 — 차원별 표기 (ui-refine 05)', () => {
    const view = ruleView(
      header({
        conditions: {
          requestMethods: ['post'],
          resourceTypes: ['script'],
          initiatorDomains: ['init.io'],
          tabDomains: ['tab.io'],
          excludedDomains: ['skip.io'],
          expiresAt: 1_700_000_000_000,
        },
      }),
      t,
    );
    // 요약엔 조건이 섞이지 않는다
    expect(view.summary).toBe('X-Test: aaa');
    expect(view.conditionBadges).toEqual([
      { label: 'POST', tone: 'neutral' },
      { label: 'script', tone: 'neutral' },
      { label: '@init.io', tone: 'neutral' },
      { label: 'tab:tab.io', tone: 'neutral' },
      { label: '~skip.io', tone: 'exclude' },
      expect.objectContaining({ tone: 'neutral', icon: 'clock' }),
    ]);
  });

  it('미설정 만료(0 이하)는 배지를 만들지 않는다', () => {
    expect(ruleView(header({ conditions: { expiresAt: 0 } }), t).conditionBadges).toEqual([]);
  });

  it('이름이 비면 종류 라벨로 폴백한다', () => {
    expect(ruleView(header({ name: '', comment: '' }), t).title).toBe('REQ');
    expect(
      ruleView({ kind: 'redirect', id: 'r', pattern: '', substitution: '', enabled: true, comment: '' }, t),
    ).toEqual({ title: 'REDIRECT', badge: 'REDIRECT', summary: '(empty)', conditionBadges: [] });
  });
});
