import { describe, expect, it } from 'vitest';
import { makeTranslator } from '@/core/i18n';
import { createModification, type Modification } from '@/core/schema';
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
      summary: 'All URLs → X-Test: aaa',
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
      { kind: 'set-cookie', id: 's', name: 'theme', value: 'dark', path: '/', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
      t,
    );
    expect(setCookie.badge).toBe('SET-COOKIE');
    expect(setCookie.summary).toBe('All URLs → theme=dark; Path=/');
    expect(setCookie.title).toBe('theme');
  });

  it('append 모드는 요약에 표기된다 (지역화)', () => {
    const m = header({ mode: 'append' });
    expect(ruleView(m, t).summary).toBe('All URLs → X-Test: aaa (Append)');
    expect(ruleView(m, ko).summary).toBe('모든 URL → X-Test: aaa (덧붙이기)');
  });

  it('빈 값은 emptyMeans를 지역화해 표기한다', () => {
    expect(ruleView(header({ value: '' }), t).summary).toBe('All URLs → X-Test: (Remove)');
    expect(ruleView(header({ value: '', emptyMeans: 'send-empty' }), ko).summary).toBe(
      '모든 URL → X-Test: (빈 값 전송)',
    );
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
    // 필터가 공백뿐이면 스코프가 없는 것과 같다 — 실효 스코프는 '모든 URL'이다.
    expect(ruleView(header({ urlFilter: '  ' }), t).summary).toBe('All URLs → X-Test: aaa');
  });

  it('조건 없으면 conditionBadges는 빈 배열 — 요약은 순수 효과만 (ui-refine 05)', () => {
    const view = ruleView(header(), t);
    expect(view.summary).toBe('All URLs → X-Test: aaa');
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
    // 요약엔 조건이 섞이지 않는다 (스코프는 조건이 아니라 규칙의 대상이라 남는다)
    expect(view.summary).toBe('All URLs → X-Test: aaa');
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

describe('새 종류 요약 (ADR 0015)', () => {
  it('UA는 UA 접두 + 값으로 읽힌다', () => {
    const view = ruleView(
      { ...createModification('user-agent'), value: 'Mozilla/5.0' } as Modification,
      t,
    );
    expect(view.badge).toBe('UA');
    // 뱃지가 종류를 말하므로 요약은 값만 — 행에서 어떤 UA인지가 읽을 거리다.
    expect(view.summary).toBe('All URLs → Mozilla/5.0');
    expect(view.title).toBe('User-Agent');
  });

  it('Header Removal은 삭제 접두 + 이름으로 읽히고, 제목이 요약과 겹치지 않는다', () => {
    const view = ruleView(
      { ...createModification('header-removal'), name: 'X-Frame-Options' } as Modification,
      t,
    );
    expect(view.badge).toBe('DEL');
    // 제목은 대상(헤더 이름), 요약은 효과 — 이름을 두 번 찍지 않는다.
    expect(view.title).toBe('X-Frame-Options');
    expect(view.summary).toMatch(/request and response/i);
  });
});

describe('실효 URL 스코프 상시 표시 (티켓 04)', () => {
  /*
   * 스코프가 없는 규칙은 **모든 요청**에 걸린다. 예전에는 그 경우 행이 스코프를 아예
   * 그리지 않아, 사용자는 "스코프가 없다"와 "스코프를 아직 안 봤다"를 구별할 수 없었다.
   * 요청을 통째로 없애는 Block에서는 그 차이가 페이지가 깨지는지 아닌지를 가른다.
   */
  it('스코프가 없으면 "모든 URL"로 읽힌다 — 빈칸으로 두지 않는다', () => {
    expect(ruleView(header(), t).summary).toBe('All URLs → X-Test: aaa');
    expect(ruleView(header(), ko).summary).toBe('모든 URL → X-Test: aaa');
  });

  it('Block은 스코프가 요약의 전부다 — 뱃지가 이미 효과를 말한다', () => {
    const scoped = ruleView(
      { ...createModification('block'), urlFilter: 'ads.example.com', urlMatchType: 'domain' } as Modification,
      t,
    );
    expect(scoped.badge).toBe('BLOCK');
    expect(scoped.title).toBe('Block request');
    expect(scoped.summary).toBe('ads.example.com');
  });

  it('스코프 없는 Block은 목록에서 "모든 URL"로 드러난다', () => {
    const view = ruleView(createModification('block'), ko);
    expect(view.summary).toBe('모든 URL');
  });

  it('Redirect는 자기 패턴이 스코프라 접두를 붙이지 않는다', () => {
    const view = ruleView(
      { kind: 'redirect', id: 'r', pattern: '^https://a/(.*)', substitution: 'https://b/\\1', enabled: true, comment: '' },
      t,
    );
    expect(view.summary).toBe('^https://a/(.*) → https://b/\\1');
  });
});
