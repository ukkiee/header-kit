import { describe, expect, it } from 'vitest';
import { makeTranslator } from '@/core/i18n';
import { assembleSetCookie, createModification, type Modification } from '@/core/schema';
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

/**
 * 행이 그리는 것이 티켓 05에서 **한 줄 요약 문자열에서 칩 줄로** 바뀌었다 (ADR 0017).
 *
 * 예전 계약은 `스코프 → 효과` 한 문자열이었고 조건은 따로 배지 줄이었다. 시안은 둘째 줄을
 * 스코프 칩으로 시작해 효과·리소스 묶음·요청 메서드 칩으로 잇는다 — 그래서 여기서 재는 것은
 * **무엇이 어느 칩으로 나오고 그 순서가 무엇인가**이지 문자열의 모양이 아니다.
 */
describe('ruleView — 제목과 뱃지', () => {
  it('제목은 메모다', () => {
    expect(ruleView(header({ comment: 'test' }), t).title).toBe('test');
  });

  /*
   * 메모가 없으면 **종류 이름**이다 (스펙 story 10). 예전에는 헤더 이름이 그 자리를 채웠는데,
   * 그러면 제목과 효과 칩이 같은 이름을 두 번 말한다 — 시안이 제목 자리를 메모에 내주고
   * 이름은 효과 쪽에만 두었다.
   */
  it('메모가 없으면 종류 이름이다 — 헤더 이름이 아니다', () => {
    expect(ruleView(header(), t).title).toBe('Request header');
    expect(ruleView(header(), ko).title).toBe('요청 헤더');
  });

  it('여덟 종류의 뱃지', () => {
    const badgeOf = (kind: Modification['kind']) => ruleView(createModification(kind), t).badge;
    expect(badgeOf('request-header')).toBe('REQ');
    expect(badgeOf('response-header')).toBe('RES');
    expect(badgeOf('cookie')).toBe('COOKIE');
    expect(badgeOf('set-cookie')).toBe('SET-COOKIE');
    expect(badgeOf('redirect')).toBe('REDIRECT');
    expect(badgeOf('user-agent')).toBe('UA');
    expect(badgeOf('header-removal')).toBe('DEL');
    expect(badgeOf('block')).toBe('BLOCK');
  });
});

describe('ruleView — 스코프 칩', () => {
  /*
   * 스코프가 **가장 앞**인 것이 시안의 결정이다 (story 13) — 어디에 걸리는지가 가장 중요하다.
   * 스코프가 없는 규칙은 모든 요청에 걸리므로 빈칸이 아니라 "모든 URL"이라고 말한다: 빈칸은
   * "스코프가 없다"와 "아직 안 봤다"를 구별해 주지 않고, Block에서는 그 차이가 페이지가
   * 깨지는지 아닌지를 가른다.
   */
  it('스코프가 없으면 "모든 URL"이고 정규식 표시가 붙지 않는다', () => {
    expect(ruleView(header(), t).scope).toEqual({ label: 'All URLs', regex: false });
    expect(ruleView(header(), ko).scope.label).toBe('모든 URL');
  });

  it('공백뿐인 필터는 스코프가 없는 것과 같다', () => {
    expect(ruleView(header({ urlFilter: '  ' }), t).scope).toEqual({ label: 'All URLs', regex: false });
  });

  it('와일드카드 스코프에는 정규식 표시가 붙지 않는다', () => {
    expect(ruleView(header({ urlFilter: 'imtest.me/', urlMatchType: 'contains' }), t).scope).toEqual({
      label: 'imtest.me/',
      regex: false,
    });
  });

  it('정규식 스코프에는 표시가 붙는다 (story 16)', () => {
    expect(ruleView(header({ urlFilter: '^https://a/', urlMatchType: 'regex' }), t).scope).toEqual({
      label: '^https://a/',
      regex: true,
    });
  });

  /*
   * 매치 방식이 없는 옛 규칙은 정규식이다 (ADR 0008의 하위 호환). 표시를 안 붙이면 화면이
   * 와일드카드라고 말하는데 실제로는 정규식으로 매칭되어, 안 걸리는 이유를 알 길이 없어진다.
   */
  it('매치 방식이 없는 옛 규칙도 정규식으로 표시된다', () => {
    expect(ruleView(header({ urlFilter: '^https://a/' }), t).scope.regex).toBe(true);
  });
});

describe('ruleView — 효과 칩', () => {
  it('헤더 계열은 이름: 값이다', () => {
    expect(ruleView(header(), t).chips).toEqual(['X-Test: aaa']);
  });

  it('빈 값은 빈 값의 뜻을 지역화해 말한다', () => {
    expect(ruleView(header({ value: '' }), t).chips).toEqual(['X-Test: (Remove)']);
    expect(ruleView(header({ value: '', emptyMeans: 'send-empty' }), ko).chips).toEqual([
      'X-Test: (빈 값 전송)',
    ]);
  });

  it('append 모드는 효과에 표기된다 (지역화)', () => {
    expect(ruleView(header({ mode: 'append' }), t).chips).toEqual(['X-Test: aaa (Append)']);
    expect(ruleView(header({ mode: 'append' }), ko).chips).toEqual(['X-Test: aaa (덧붙이기)']);
  });

  it('User-Agent는 보낼 문자열이 효과다', () => {
    const m = { ...createModification('user-agent'), value: 'Mozilla/5.0' } as Modification;
    expect(ruleView(m, t).chips).toEqual(['Mozilla/5.0']);
  });

  /*
   * Header Removal은 **이름과 방향을 둘 다** 말한다. 제목이 종류 이름으로 바뀌면서 헤더
   * 이름이 제목 자리를 잃었으므로, 효과 칩이 그것을 받아야 행에서 무엇이 지워지는지 읽을 수
   * 있다. 양쪽에서 지운다는 것은 이 종류의 특징이라 함께 남긴다.
   */
  it('Header Removal은 지울 이름과 "양쪽에서"를 함께 말한다', () => {
    const m = { ...createModification('header-removal'), name: 'X-Frame-Options' } as Modification;
    expect(ruleView(m, t).chips).toEqual(['X-Frame-Options', 'Removed from request and response']);
  });

  it('Block은 효과 칩이 없다 — 뱃지와 스코프가 이미 전부를 말한다', () => {
    const m = { ...createModification('block'), urlFilter: 'ads.example.com', urlMatchType: 'domain' } as Modification;
    expect(ruleView(m, t)).toMatchObject({
      badge: 'BLOCK',
      scope: { label: 'ads.example.com', regex: false },
      chips: [],
    });
  });

  /*
   * Redirect는 **자기 패턴이 곧 스코프**다 (ADR 0007). 스코프 칩에 그것을 두고 효과 칩은
   * 목적지를 든다 — 앞에 또 붙이면 같은 패턴을 두 번 말한다.
   */
  it('Redirect는 패턴이 스코프이고 효과는 목적지다', () => {
    const m: Modification = {
      kind: 'redirect',
      id: 'r',
      pattern: '^https://a/(.*)',
      substitution: 'https://b/\\1',
      enabled: true,
      comment: '',
    };
    expect(ruleView(m, t)).toMatchObject({
      title: 'Redirect',
      scope: { label: '^https://a/(.*)', regex: true },
      chips: ['→ https://b/\\1'],
    });
  });
});

describe('ruleView — 응답 쿠키 속성 칩', () => {
  const setCookie = (over: Record<string, unknown> = {}): Modification =>
    ({
      kind: 'set-cookie',
      id: 's',
      name: 'theme',
      value: 'dark',
      enabled: true,
      mode: 'override',
      emptyMeans: 'remove',
      comment: '',
      ...over,
    }) as Modification;

  /*
   * 칩은 **실제로 나가는 줄을 그대로 가른 것**이다 — 그래서 순서가 조립 순서와 같다.
   * 행이 보여 주는 것과 서버가 받는 것이 어긋날 자리를 구조에서 없앤다.
   */
  it('이름=값이 효과이고 속성이 나가는 줄의 순서대로 이어진다 (story 15)', () => {
    const view = ruleView(
      setCookie({
        sameSite: 'lax',
        secure: true,
        httpOnly: true,
        domain: 'a.example',
        path: '/',
        maxAge: '600',
      }),
      t,
    );
    expect(view.chips).toEqual([
      'theme=dark',
      'Domain=a.example',
      'Path=/',
      'Max-Age=600',
      'SameSite=Lax',
      'Secure',
      'HttpOnly',
    ]);
    // 칩을 도로 이으면 컴파일이 내보내는 그 줄이다 — 두 표기가 갈라질 수 없다.
    expect(view.chips.join('; ')).toBe(
      assembleSetCookie({
        name: 'theme',
        value: 'dark',
        sameSite: 'lax',
        secure: true,
        httpOnly: true,
        domain: 'a.example',
        path: '/',
        maxAge: '600',
      }),
    );
  });

  /*
   * 이름도 값도 비면 **조립하지 않는다** — 컴파일이 쓰는 술어와 같다. 조립하면 `=` 한 글자가
   * 되어 "빈 쿠키를 심는" 다른 규칙이 되고, 행은 그 `=`를 효과라고 말하게 된다.
   */
  it('이름도 값도 비면 빈 값의 뜻을 말한다 — `=` 한 글자가 아니다', () => {
    expect(ruleView(setCookie({ name: '', value: '' }), t).chips).toEqual(['(Remove)']);
    expect(
      ruleView(setCookie({ name: '  ', value: '', emptyMeans: 'send-empty' }), ko).chips,
    ).toEqual(['(빈 값 전송)']);
  });

  it('비운 속성은 칩이 되지 않는다 — 안 정한 것이 기본값으로 박히지 않는다', () => {
    expect(ruleView(setCookie({ path: '/' }), t).chips).toEqual(['theme=dark', 'Path=/']);
  });

  it('끔으로 둔 Secure·HttpOnly는 칩이 되지 않는다', () => {
    expect(ruleView(setCookie({ secure: false, httpOnly: false }), t).chips).toEqual(['theme=dark']);
  });

  /*
   * 가를 수 없어 **원시로 보존된** 항목은 그 줄이 그대로 효과다 (ADR 0017). 속성 칩이 붙지
   * 않는 것이 정확하다 — 갈라 두지 않았으므로 어느 속성이 있는지 이 버전은 모른다.
   */
  it('원시로 보존된 응답 쿠키는 그 줄이 효과이고 속성 칩이 없다', () => {
    const raw = setCookie({ name: undefined, value: undefined, raw: 'sid=abc; Expires=Thu, 01 Jan 2026 00:00:00 GMT' });
    expect(ruleView(raw, t).chips).toEqual(['sid=abc; Expires=Thu, 01 Jan 2026 00:00:00 GMT']);
  });
});

describe('ruleView — 조건 칩', () => {
  /*
   * 조건은 **리소스 묶음과 요청 메서드 둘뿐**이다 (ADR 0017). 예전의 조건 배지 개념(제외
   * 도메인의 부정 접두·만료 시계 아이콘)은 그 조건들과 함께 사라졌다.
   */
  it('조건이 없으면 효과 칩만 남는다', () => {
    expect(ruleView(header(), t).chips).toEqual(['X-Test: aaa']);
  });

  // 저장된 값의 순서가 아니라 **묶음의 표시 순서**로 나온다 — 행마다 칩 차례가 달라지지 않는다.
  it('리소스 종류는 여덟 묶음의 이름으로 접혀 나온다', () => {
    const view = ruleView(header({ conditions: { resourceTypes: ['script', 'sub_frame'] } }), t);
    expect(view.chips).toEqual(['X-Test: aaa', 'Document', 'Script']);
    expect(ruleView(header({ conditions: { resourceTypes: ['sub_frame'] } }), ko).chips).toEqual([
      'X-Test: aaa',
      '문서',
    ]);
  });

  it('요청 메서드는 대문자 칩이다', () => {
    expect(ruleView(header({ conditions: { requestMethods: ['post', 'get'] } }), t).chips).toEqual([
      'X-Test: aaa',
      'POST',
      'GET',
    ]);
  });

  /** 칩 순서는 효과 → (응답 쿠키 속성) → 리소스 묶음 → 요청 메서드다 (스펙의 모듈 항목). */
  it('칩 순서 — 효과, 리소스 묶음, 요청 메서드', () => {
    const view = ruleView(
      header({ conditions: { resourceTypes: ['xmlhttprequest'], requestMethods: ['post'] } }),
      t,
    );
    expect(view.chips).toEqual(['X-Test: aaa', 'XHR', 'POST']);
  });

  it('응답 쿠키에서는 속성 칩이 효과와 조건 사이에 들어간다', () => {
    const view = ruleView(
      {
        kind: 'set-cookie',
        id: 's',
        name: 'theme',
        value: 'dark',
        path: '/',
        enabled: true,
        mode: 'override',
        emptyMeans: 'remove',
        comment: '',
        conditions: { resourceTypes: ['image'], requestMethods: ['get'] },
      },
      t,
    );
    expect(view.chips).toEqual(['theme=dark', 'Path=/', 'Image', 'GET']);
  });
});
