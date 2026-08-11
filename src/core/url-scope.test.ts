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

describe('그룹 안에 숨은 갈래도 전부 호스트에 묶여야 좁다 (release R2-1)', () => {
  /*
   * 최상위 `|`만 자르면 그룹이 통째로 조각 하나가 되어, 그 안의 호스트꼴 토큰 하나가
   * **다른 갈래까지** 대신 증명한다. 아래 넷은 하나같이 `.invalid` 탐침 둘을 피하면서
   * 모든 HTTPS `.com`을 삼키는데, 그룹 밖에서 보면 `ads.example.net`만 보인다.
   *
   * 판정은 **문맥을 분배해 전개**한다 — 그룹 앞뒤가 각 갈래에 복사되므로
   * `^(a/|b/)`는 `^a/`·`^b/`가 되고, 아래 회귀 방지 행처럼 문맥이 호스트를 완성하는
   * 모양(`^https://(ads|cdn)\.example\.com/`)은 여전히 좁다.
   */
  it.each([
    // 리뷰 반례 — 그룹이 최상위 전체를 감싼다.
    ['^(https://ads\\.example\\.net/|https://.*\\.com/)', 'regex'],
    // 스킴 뒤 그룹 — 문맥(`^https://`)이 그룹 앞에 있다.
    ['^https://(ads\\.example\\.net/|.*\\.com/)', 'regex'],
    // 비캡처 그룹도 같다.
    ['^(?:https://ads\\.example\\.net/|https://.*\\.com/)', 'regex'],
    // 중첩 이중 괄호 — 갈래마다 다시 괄호가 씌워져 있다.
    ['^((https://ads\\.example\\.net/)|(https://.*\\.com/))', 'regex'],
  ] as const)('%s (%s) → wide', (pattern, matchType) => {
    expect(urlScopeBreadth(pattern, matchType)).toBe('wide');
  });

  it('전개는 문맥을 분배한다 — 그냥 자르면 뒤집히는 회귀 방지 행', () => {
    // 순진한 분할은 이것을 `^https://(ads`와 `cdn)\.example\.com/`로 찢는다.
    expect(urlScopeBreadth('^https://(ads|cdn)\\.example\\.com/', 'regex')).toBe('narrow');
  });

  it('포기 경로는 전부 넓음으로 떨어진다 — 갈래 상한과 빈 매칭이 되는 수량자', () => {
    // 갈래 2^7 = 128 > 상한. 하나하나는 전부 호스트에 묶이지만 세지 않고 물러난다.
    expect(urlScopeBreadth('^https://(a|b)(c|d)(e|f)(g|h)(i|j)(k|l)(m|n)\\.example\\.com/', 'regex')).toBe(
      'wide',
    );
    // 대안 그룹 바로 뒤의 `?`는 그룹이 통째로 빠진 문자열도 매칭시킨다 — 전개가 표현하지 못한다.
    expect(urlScopeBreadth('^https://(ads|cdn)?\\.example\\.com/', 'regex')).toBe('wide');
  });
});

describe('호스트 결합은 authority 자리에서만 센다 (release R-1, 티켓 05)', () => {
  /*
   * 판정이 패턴 문자열 **전체**를 훑으면 경로에 있는 도메인꼴 조각이 호스트로 세어진다.
   * 사용자는 광고 도메인 하나를 막았다고 믿고 나가지만, 실제로는 방문하는 모든 사이트의 그
   * 경로에서 요청이 사라진다 — Block은 요청을 아예 없애는 유일한 종류라 그 오판이 페이지를
   * 깨뜨린다. 그래서 호스트는 **authority 구간**에서만 센다: 스킴 구분자 뒤부터 첫 경로 구분자
   * 앞까지, 구분자가 없으면 첫 경로 구분자 앞 전체.
   *
   * 아래 넷은 하나같이 `.invalid` 탐침 둘을 피하면서 모든 호스트에 걸린다. 전체 스캔에서는
   * 경로의 `path.example.net`·`ads.example.com`이 호스트 노릇을 해 '좁음'으로 통과했다.
   */
  it.each([
    // 그룹 안 갈래의 **경로** 토큰이 그 갈래를 대신 증명했다.
    ['^(https://ads\\.example\\.net/|https://.*\\.com/path\\.example\\.net/)', 'regex'],
    // 호스트 자리가 와일드카드이고 도메인은 경로에 있다.
    ['^https://[^/]+/ads\\.example\\.com/', 'regex'],
    // 스킴 뒤 호스트 자리가 전부 와일드카드다.
    ['^https?://.*/ads\\.example\\.com', 'regex'],
    // 부분 문자열 값이 경로 조각만 들었다.
    ['/path.example.net/', 'contains'],
  ] as const)('%s (%s) → wide', (pattern, matchType) => {
    expect(urlScopeBreadth(pattern, matchType)).toBe('wide');
  });

  it('authority 자리의 호스트는 그대로 좁다 — 경로에 무엇이 있든', () => {
    // 경로에 도메인꼴이 섞여 있어도 호스트가 묶여 있으면 좁다(기존 행과 같은 성질).
    expect(urlScopeBreadth('^https://ads\\.example\\.com/path\\.example\\.net/', 'regex')).toBe('narrow');
    // 스킴 뒤 authority에 로컬 호스트가 오면 좁다 — 기기 하나에 묶여 있다.
    expect(urlScopeBreadth('^https?://localhost:3000/api', 'regex')).toBe('narrow');
  });

  /*
   * **남는 한계** (스펙 D1, 플랜 게이트 r1 R-4에서 사람이 reject). 이 판정이 증명하는 것은
   * 패턴 문자열 안에서의 위치이지 실제 URL 안에서의 위치가 아니다. 앵커 없는 부분 문자열은
   * 여전히 쿼리·경로에 그 문자열이 들어간 URL에도 걸린다. 알고 남기는 것이라 판정을 여기에
   * 못 박아 둔다 — 나중에 조일 때 무엇이 바뀌는지가 이 행에서 바로 읽힌다.
   */
  it('앵커 없는 부분 문자열은 여전히 좁음이다 — 알고 남긴 한계', () => {
    expect(urlScopeBreadth('ads.example.com/path', 'contains')).toBe('narrow');
  });
});

describe('스킴 구분자는 구분자 앞에서만 찾는다 (티켓 05 code-review)', () => {
  /*
   * 아래 넷은 `ff274b2`에서 올바르게 `wide`였는데 티켓 05의 첫 구현이 `narrow`로 **뒤집었다**.
   * 원인은 스킴 구분자를 `indexOf('://')`로 찾은 것 하나다 — 리다이렉트·트래킹 엔드포인트를
   * 막는 흔한 모양에는 `://`가 **쿼리 안에** 또 있고, 그것을 스킴 구분자로 집으면 구간이 쿼리
   * 안에서 잘려 나와 거기 있는 도메인이 호스트로 세어진다. 즉 이 티켓이 닫으려던 결함을 이
   * 티켓이 새로 열었다.
   *
   * 회귀가 조용히 통과한 이유는 51+6행 어디도 **경로·쿼리에 URL이 박힌 모양**을 밟지 않았기
   * 때문이다. 그래서 여기에 행으로 못 박는다.
   */
  it.each([
    ['^https?:\\/\\/[^\\/]+\\/u=https://ads\\.example\\.com\\/', 'regex'],
    ['[^\\/]+\\/u=https://ads\\.example\\.com\\/', 'regex'],
    ['.*\\/u=https://ads\\.example\\.com\\/', 'regex'],
    ['^.*\\/track\\/https://ads\\.example\\.com\\/px\\.gif', 'regex'],
  ] as const)('%s (%s) → wide', (pattern, matchType) => {
    expect(urlScopeBreadth(pattern, matchType)).toBe('wide');
  });
});

describe('authority는 쿼리·프래그먼트에서도 끊긴다 (티켓 05 code-review)', () => {
  /*
   * 구간이 `/`에서만 끊기면 **쿼리 자리**의 도메인이 호스트로 세어진다. 아래 클래스형 둘은
   * `[^/]`가 `/`를 넘지 못하므로 도메인이 쿼리에 있다는 것이 패턴 문자열만으로 확정되는데도
   * '좁음'으로 통과했고, 실제로는 `https://victim.test?r=ads.example.com` 꼴로 모든 호스트에
   * 걸린다.
   */
  it.each([
    ['^https?://.*\\?d=ads\\.example\\.com', 'regex'],
    ['^https://[^/]*\\?r=ads\\.example\\.com', 'regex'],
    ['^https://[^/]+\\?utm_src=ads\\.example\\.com', 'regex'],
    ['^https?://.*#ads\\.example\\.com', 'regex'],
    ['?ref=ads.example.com', 'contains'],
  ] as const)('%s (%s) → wide', (pattern, matchType) => {
    expect(urlScopeBreadth(pattern, matchType)).toBe('wide');
  });

  it('맨 `?`는 정규식에서 수량자다 — 구분자로 세면 호스트에 묶인 패턴이 확인을 받는다', () => {
    // `https://example.com/`과 `https://ads.example.com/` 둘만 매칭한다 — 호스트에 묶여 있다.
    expect(urlScopeBreadth('^https://(ads\\.)?example\\.com/', 'regex')).toBe('narrow');
  });
});

describe('비정규식 매치 방식은 리터럴로 읽는다 (ADR 0008 컴파일 매핑, 티켓 05 code-review)', () => {
  /*
   * ADR 0008은 `contains`·`prefix`를 DNR의 **비정규식** `urlFilter`로 내려보낸다 — 그 값에서
   * `[`·`\`는 특수문자가 아니라 평범한 글자다. 정규식 독법으로 읽으면 `[`가 문자 클래스가 되어
   * 그 안쪽의 `/`를 구분자로 세지 않게 되고, 경로 조각만 든 부분 문자열이 '좁음'으로 통과한다 —
   * 브래킷 하나가 가드레일을 끄는 셈이다. 브래킷만 뺀 쌍둥이는 이미 `wide`였다.
   */
  it.each([
    ['[/ads.example.com/', 'contains'],
    ['x[/ads.example.com/', 'contains'],
    ['v1[/ads.example.com/beacon', 'contains'],
    // 닫힌 클래스 꼴 — 클래스가 경로 구분자를 삼키는 경로.
    ['x[a/b]ads.example.com/y', 'contains'],
  ] as const)('%s (%s) → wide', (pattern, matchType) => {
    expect(urlScopeBreadth(pattern, matchType)).toBe('wide');
  });

  it('같은 리터럴 문자열은 contains와 prefix에서 같은 판정을 받는다', () => {
    // 잣대가 갈려 있을 때 이 문자열은 contains에서 narrow, prefix에서 wide였다.
    const literal = 'https://[/ads.example.com/';
    expect(urlScopeBreadth(literal, 'contains')).toBe(urlScopeBreadth(literal, 'prefix'));
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

/**
 * 폼이 방식을 **둘만 노출한 뒤에도 판정은 그대로다** (수용 기준, 티켓 07).
 *
 * 판정은 저장된 `urlMatchType`을 읽으므로 화면이 무엇을 보여 주든 네 가지 모두를 계속
 * 판정해야 한다 — 폼에서 사라진 `domain`·`prefix`로 저장된 옛 규칙이 이 함수를 그대로 지난다.
 * 그것들을 잘라 내면 옛 Block 규칙이 판정 없이 통과한다.
 */
describe('노출 방식이 둘로 줄어도 네 가지를 그대로 판정한다 (티켓 07)', () => {
  it.each([
    ['ads.example.com', 'domain', 'narrow'],
    ['ads.example.com', 'contains', 'narrow'],
    ['https://ads.example.com/', 'prefix', 'narrow'],
    ['^https://ads\\.example\\.com/', 'regex', 'narrow'],
    ['*://*/*', 'domain', 'wide'],
    ['/ads/', 'contains', 'wide'],
    ['ads.example.com', 'prefix', 'wide'],
    ['^https://[^/]+/ads/', 'regex', 'wide'],
  ] as const)('%s (%s) → %s', (pattern, matchType, expected) => {
    expect(urlScopeBreadth(pattern, matchType)).toBe(expected);
  });

  /*
   * **접기가 판정을 바꿀 수 있다 — 알고 남긴 결과다.** 수렴 저장이 `prefix`를 와일드카드
   * (`contains`)로 굳히는데, 스킴에 닿지 못한 접두는 호스트를 특정하지 못해 넓음이고 같은
   * 문자열이 부분 문자열로는 호스트에 묶여 좁음이다. 판정이 달라지는 것은 **매칭 자체가
   * 달라지기 때문**이라 정확하다 — 접두는 URL 시작에 앵커되고 부분 문자열은 아니다.
   *
   * 티켓 07 이후 이 차이가 사용자에게 하는 일은 없다(넓음은 아무것도 막지 않는다). 여기 적어
   * 두는 것은 다음 사람이 이것을 버그로 보고 두 방식을 같은 잣대로 묶지 않게 하기 위해서다.
   */
  it('접두를 와일드카드로 접으면 판정이 좁아진다 — 매칭이 실제로 달라지기 때문이다', () => {
    expect(urlScopeBreadth('ads.example.com', 'prefix')).toBe('wide');
    expect(urlScopeBreadth('ads.example.com', 'contains')).toBe('narrow');
  });

  /*
   * 릴리스 게이트가 찾아낸 넓은 정규식들 — 예전에는 폼의 확인 단계가 이것들을 실제 브라우저
   * 경로에서 한 번 더 잡았다(스모크 N18j·N18k·N18l). 티켓 07이 그 단계를 없애면서 화면에
   * 관측할 것이 남지 않으므로, 그 패턴들의 **판정**을 여기로 옮겨 붙든다.
   */
  it.each([
    ['^https://.*\\.com/|ads\\.example\\.net', '최상위 대안 하나가 넓다 (release R-2)'],
    ['^(https://ads\\.example\\.net/|https://.*\\.com/)', '그룹 안 갈래가 넓다 (release R2-1)'],
    ['^https://[^/]+/ads\\.example\\.com/', '도메인이 경로 자리에 있다 (release R-1)'],
  ])('%s → wide — %s', (pattern) => {
    expect(urlScopeBreadth(pattern, 'regex')).toBe('wide');
  });
});
