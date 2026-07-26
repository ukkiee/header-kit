import type { UrlMatchType } from './model';

/**
 * URL 스코프가 얼마나 넓은지의 판정 (ADR 0015, 티켓 04).
 *
 * `wide`는 "잘못됐다"가 아니라 "**확인이 필요하다**"는 뜻이다. 넓은 스코프의 Block은
 * 사용자가 정말 원한 것일 수도 있으므로(모든 광고 도메인을 한 번에 막는 식) 저장을
 * 금지하지 않고 명시적 확인을 요구한다. 반대로 `invalid`는 그 패턴으로는 브라우저
 * 규칙이 아예 만들어지지 않는다는 뜻이라 저장 자체를 막는다 — 사용자는 차단이
 * 걸렸다고 믿는데 아무 일도 일어나지 않는 것이 가장 나쁜 결과다.
 */
export type ScopeBreadth = 'wide' | 'narrow' | 'invalid';

/** 스코프 자리에 자주 들어오는 "전부" 토큰 — 어느 매치 방식에서든 넓음이다. */
const GLOBAL_TOKENS = new Set(['*', '*://*/*', '<all_urls>', '*://*', '://*/*', '**']);

/**
 * 도메인처럼 읽히지만 호스트가 아닌 마지막 라벨 — `tracker.js`는 사이트가 아니라
 * 모든 사이트에 있는 파일이다. 이걸 호스트로 세면 가드레일이 정확히 반대로 작동한다.
 */
const FILE_EXTENSIONS = new Set([
  'js', 'mjs', 'cjs', 'css', 'html', 'htm', 'php', 'asp', 'aspx', 'jsp', 'json', 'xml',
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'woff', 'woff2', 'ttf', 'map',
  'txt', 'pdf', 'wasm',
]);

/** 라벨이 하나뿐이지만 넓지 않은 호스트 — 이 확장이 존재하는 이유인 개발 호스트다. */
const LOCAL_HOSTS = new Set(['localhost']);

/**
 * 이 문자열이 **어떤 호스트에 묶여 있는가**. 판정 전체가 이 질문 하나로 굴러간다.
 *
 * 도메인꼴 조각이 있는지만 보면 안 된다 — `tracker.js`도, 경로에 도메인이 섞인
 * `^https?://[^/]+/ads\.js`도 그 검사를 통과하지만 둘 다 모든 호스트에 걸린다.
 * 그래서 (1) `/`·`:`·`?`·끝으로 **닫히는** 자리에 있고, (2) 실제 라벨이 둘 이상이며,
 * (3) 마지막 라벨이 파일 확장자가 아닐 때만 호스트로 인정한다.
 */
function isHostBound(text: string): boolean {
  const head = text.split(/[/:?]/)[0] ?? '';
  if (LOCAL_HOSTS.has(head.toLowerCase())) return true;
  for (const match of text.matchAll(/[a-z0-9*_-]+(?:\.[a-z0-9*_-]+)+(?=[:/?]|$)/gi)) {
    const labels = match[0].split('.');
    if (FILE_EXTENSIONS.has(labels[labels.length - 1]!.toLowerCase())) continue;
    // 와일드카드뿐인 라벨은 아무 호스트도 특정하지 못한다 — `*.com`은 사실상 `com`이고,
    // `||com`은 모든 .com을 막는다.
    if (labels.filter((label) => label.replace(/\*/g, '') !== '').length >= 2) return true;
  }
  return false;
}

/**
 * 어느 호스트에도 속하지 않는 탐침 URL. 정규식이 이 중 하나라도 물면 그 정규식은
 * 특정 도메인에 묶여 있지 않다는 뜻이다.
 *
 * 구문을 뜯어보는 것보다 이쪽이 확실하다 — 대안(`ads\.example\.com|.*`)이나 선택
 * 그룹(`^https://(ads\.example\.com)?`)처럼 앵커를 우회하는 모양은 종류가 끝없지만,
 * "무관한 호스트에 걸리느냐"는 한 번에 전부 드러낸다. `.invalid`는 RFC 2606이
 * 영원히 등록되지 않도록 예약한 TLD라, 사용자가 실제로 겨냥할 일이 없다.
 */
const UNRELATED_URLS = ['https://probe.invalid/', 'http://sub.probe.invalid/a/b.js?q=1'];

export function urlScopeBreadth(
  urlFilter: string | undefined,
  matchType: UrlMatchType | undefined,
): ScopeBreadth {
  const pattern = urlFilter?.trim() ?? '';
  // 스코프 없음 = 모든 요청. 부재를 '좁음'으로 오해하면 가장 위험한 규칙이 조용히 통과한다.
  if (pattern === '') return 'wide';
  if (GLOBAL_TOKENS.has(pattern)) return 'wide';

  // 매치 방식 부재 = regex (ADR 0008의 하위 호환 규칙, compile과 같은 기본값).
  switch (matchType ?? 'regex') {
    case 'domain':
      // 도메인 매치는 값 자체가 호스트다.
      return isHostBound(pattern) ? 'narrow' : 'wide';
    case 'prefix':
      return prefixBreadth(pattern);
    case 'contains':
      // 부분 문자열은 호스트 자리에 놓인 도메인을 품을 때만 묶인다.
      return isHostBound(pattern) ? 'narrow' : 'wide';
    case 'regex':
      return regexBreadth(pattern);
  }
}

/** 접두 매치 — 스킴 뒤 호스트 자리까지 닿아야 좁다(`https://`만으로는 전부다). */
function prefixBreadth(pattern: string): ScopeBreadth {
  const separator = pattern.indexOf('://');
  if (separator === -1) {
    // 스킴 구분자에 닿지 못한 접두(`http`, `*`)는 호스트를 특정하지 못한다.
    return 'wide';
  }
  const host = pattern.slice(separator + 3).split('/')[0] ?? '';
  return isHostBound(host) ? 'narrow' : 'wide';
}

/**
 * RE2가 지원하지 않는 구문 — 브라우저가 규칙 등록을 거부한다. JS는 이것들을 컴파일하므로
 * `new RegExp`만으로는 잡히지 않아 따로 본다.
 */
const RE2_UNSUPPORTED = /\(\?=|\(\?!|\(\?<=|\(\?<!|\\[1-9]/;

/**
 * RE2 전용 인라인 플래그 — 반대로 JS가 컴파일하지 못한다. 컴파일 검사 전에 벗겨야
 * 브라우저는 받아 줄 패턴을 우리가 먼저 거부하지 않는다.
 */
const RE2_INLINE_FLAGS = /^\(\?[imsU]+\)/;

function regexBreadth(pattern: string): ScopeBreadth {
  if (RE2_UNSUPPORTED.test(pattern)) return 'invalid';
  let compiled: RegExp;
  try {
    compiled = new RegExp(pattern.replace(RE2_INLINE_FLAGS, ''));
  } catch {
    return 'invalid';
  }
  // 무관한 호스트에 하나라도 걸리면 이 정규식은 어느 도메인에도 묶여 있지 않다.
  if (UNRELATED_URLS.some((url) => compiled.test(url))) return 'wide';
  // 통과했다면 호스트를 가리는 것까지는 하고 있다. 남은 질문은 **무엇으로** 가리느냐다 —
  // 경로만 집는 `^https?://[^/]+/ads\.js`는 여기서 걸러진다.
  // `\.`는 리터럴 점이라 되살리고, `.`·`*` 같은 메타문자는 도메인 조각을 만들지 못하게 둔다.
  return isHostBound(pattern.replace(/\\\./g, '.')) ? 'narrow' : 'wide';
}
