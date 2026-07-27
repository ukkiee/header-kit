import { describe, expect, it } from 'vitest';
import { urlScopeBreadth } from './url-scope';

/**
 * URL 스코프의 폭 판정 (티켓 04, ADR 0015).
 *
 * 이 판정이 존재하는 이유는 Block 하나다 — 요청을 통째로 막는 종류라서, 스코프가 어느
 * 호스트에도 걸리지 않으면 사용자가 의도한 것보다 훨씬 넓은 트래픽이 사라진다.
 * 그래서 기준은 "**어떤 호스트에 묶여 있는가**"다: 호스트에 묶이면 좁음, 아니면 넓음.
 */

describe('전역 와일드카드는 넓음', () => {
  it.each([
    ['*://*/*', 'contains'],
    ['<all_urls>', 'contains'],
    ['*', 'contains'],
    ['*', 'domain'],
    ['*://*/*', 'prefix'],
  ] as const)('%s (%s) → wide', (pattern, matchType) => {
    expect(urlScopeBreadth(pattern, matchType)).toBe('wide');
  });

  it('스코프가 아예 없으면 모든 요청이라 넓음', () => {
    expect(urlScopeBreadth(undefined, undefined)).toBe('wide');
    expect(urlScopeBreadth('   ', 'domain')).toBe('wide');
  });
});

describe('도메인에 묶인 스코프는 좁음', () => {
  it.each([
    ['ads.example.com', 'domain'],
    ['example.com', 'domain'],
    ['localhost:3000', 'domain'],
    ['https://ads.example.com/tag', 'prefix'],
    ['ads.example.com/tag.js', 'contains'],
    ['^https://ads\\.example\\.com/', 'regex'],
    // 서브도메인 와일드카드도 결국 example.com에 묶인다.
    ['.*\\.example\\.com/', 'regex'],
  ] as const)('%s (%s) → narrow', (pattern, matchType) => {
    expect(urlScopeBreadth(pattern, matchType)).toBe('narrow');
  });
});

describe('도메인 앵커가 없으면 넓음', () => {
  it.each([
    // 어떤 호스트에도 묶이지 않는 정규식 — 모든 사이트의 요청에 걸린다.
    ['.*', 'regex'],
    ['^https?://', 'regex'],
    ['^https://.*', 'regex'],
    // 스킴만으로는 호스트에 닿지 못한다.
    ['https://', 'prefix'],
    ['http', 'prefix'],
    ['*://*/', 'prefix'],
    // 경로 조각은 모든 호스트에서 매칭된다.
    ['/', 'contains'],
    ['ads', 'contains'],
    // 호스트 자리가 와일드카드뿐이면 실제 호스트를 특정하지 못한다.
    ['*.*', 'domain'],
  ] as const)('%s (%s) → wide', (pattern, matchType) => {
    expect(urlScopeBreadth(pattern, matchType)).toBe('wide');
  });

  it('매치 방식이 없으면 regex로 본다 (ADR 0008 하위 호환) — compile과 같은 기본값', () => {
    expect(urlScopeBreadth('.*', undefined)).toBe('wide');
    expect(urlScopeBreadth('ads\\.example\\.com', undefined)).toBe('narrow');
  });
});

describe('도메인 토큰이 있어도 앵커가 아니면 넓음 (code-review)', () => {
  /*
   * "도메인처럼 생긴 조각이 어딘가 있다"와 "이 스코프가 그 도메인에 묶여 있다"는 다르다.
   * 그 둘을 같게 보면 아래 패턴들이 전부 확인 없이 저장되는데, 하나같이 모든 호스트에
   * 걸린다 — 가드레일이 정확히 놓치면 안 되는 모양들이다.
   */
  it.each([
    // 대안(|)이 앵커를 우회한다 — 왼쪽은 묶여 있지만 오른쪽이 전부를 연다.
    ['ads\\.example\\.com|.*', 'regex'],
    // 선택 그룹이라 호스트가 없어도 매칭된다.
    ['^https://(ads\\.example\\.com)?', 'regex'],
    // 호스트가 아니라 경로에 있는 도메인꼴 조각 — 모든 사이트의 그 파일에 걸린다.
    ['^https?://[^/]+/ads\\.js', 'regex'],
    ['tracker.js', 'contains'],
    ['index.php', 'contains'],
    // 최상위 도메인 하나 = 그 TLD 전체 — `||com`은 모든 .com을 막는다.
    ['com', 'domain'],
    ['*.com', 'domain'],
    ['*://*.com/', 'prefix'],
  ] as const)('%s (%s) → wide', (pattern, matchType) => {
    expect(urlScopeBreadth(pattern, matchType)).toBe('wide');
  });

  it('개발용 로컬 호스트는 라벨이 하나여도 좁다 — 기기 하나에 묶여 있다', () => {
    expect(urlScopeBreadth('localhost', 'domain')).toBe('narrow');
    expect(urlScopeBreadth('localhost:3000', 'domain')).toBe('narrow');
    expect(urlScopeBreadth('http://localhost:3000/api', 'prefix')).toBe('narrow');
  });

  it('경로에 도메인꼴이 있어도 호스트가 묶여 있으면 좁다', () => {
    expect(urlScopeBreadth('ads.example.com/tracker.js', 'contains')).toBe('narrow');
  });
});

describe('대안이 여럿이면 전부 호스트에 묶여야 좁다 (release R-2)', () => {
  /*
   * 대안(`|`)은 각자 독립적으로 매칭된다 — 하나라도 호스트에 안 묶이면 그 조각이 여는
   * 트래픽이 전부 차단된다. 아래 반례는 `.invalid` 탐침 둘을 모두 피하면서 모든 .com에 걸린다.
   */
  it.each([
    ['^https://.*\\.com/|ads\\.example\\.net', 'regex'],
    // 순서를 뒤집어도 같다 — 묶인 조각이 앞에 있다고 뒤가 좁아지지 않는다.
    ['ads\\.example\\.net|^https://.*\\.com/', 'regex'],
    // 경로만 집는 대안도 모든 호스트를 연다.
    ['^https://ads\\.example\\.com/|^https?://[^/]+/ads\\.js', 'regex'],
  ] as const)('%s (%s) → wide', (pattern, matchType) => {
    expect(urlScopeBreadth(pattern, matchType)).toBe('wide');
  });

  it('모든 대안이 호스트에 묶이면 좁다 — 대안을 쓴다는 이유만으로 넓다고 하지 않는다', () => {
    expect(urlScopeBreadth('ads\\.example\\.com|ads\\.example\\.net', 'regex')).toBe('narrow');
    expect(urlScopeBreadth('^https://(ads|cdn)\\.example\\.com/', 'regex')).toBe('narrow');
  });

  it('최상위가 아닌 `|`는 대안이 아니다 — 문자 클래스와 이스케이프 안쪽', () => {
    expect(urlScopeBreadth('ads\\.example\\.com/[a|b]', 'regex')).toBe('narrow');
    expect(urlScopeBreadth('ads\\.example\\.com/a\\|b', 'regex')).toBe('narrow');
  });
});

describe('규칙이 만들어지지 않는 패턴은 거부한다', () => {
  it.each([
    // 컴파일 자체가 안 되는 패턴.
    '^https://[a-z',
    '*ads',
    // RE2가 지원하지 않는 구문 — 브라우저가 규칙 등록을 거부한다.
    '^https://(?!ads\\.example\\.com)',
    '^https://(?=ads)',
    '(a)\\1',
  ])('%s → invalid', (pattern) => {
    expect(urlScopeBreadth(pattern, 'regex')).toBe('invalid');
  });

  it('RE2 전용 인라인 플래그는 거부하지 않는다 — 브라우저는 받아 준다', () => {
    // JS `new RegExp`는 `(?i)`를 컴파일하지 못하지만 RE2는 지원한다. 컴파일 검사만으로
    // 판정하면 브라우저가 받아 줄 패턴을 우리가 먼저 막는다.
    expect(urlScopeBreadth('(?i)ads\\.example\\.com', 'regex')).toBe('narrow');
  });

  it('비정규식 매치 방식에는 정규식 문법 판정을 적용하지 않는다', () => {
    // `(?!` 는 contains에서 그냥 문자열이다 — 정규식으로 읽어 거부하면 안 된다.
    expect(urlScopeBreadth('ads.example.com/(?!x)', 'contains')).toBe('narrow');
  });
});
