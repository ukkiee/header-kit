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
 * 리터럴 도메인처럼 읽히는 조각 — `label.tld`. 이것이 있으면 스코프가 어떤 호스트에
 * 묶여 있다고 본다. 판정의 중심 도구라 각 매치 방식이 자기 방식으로 이 함수를 부른다.
 */
function hasDomainLikeToken(text: string): boolean {
  return /[a-z0-9-]+\.[a-z0-9-]{2,}/i.test(text);
}

/** 호스트 자리가 실제 호스트를 가리키는가 — `*`·`*.*`·빈 문자열은 아니다. */
function isConcreteHost(host: string): boolean {
  const bare = host.replace(/\*/g, '').replace(/^\.+|\.+$/g, '');
  return bare !== '';
}

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
      // 도메인 매치는 값 자체가 호스트다 — 실제 호스트를 가리키기만 하면 좁다.
      return isConcreteHost(pattern) ? 'narrow' : 'wide';
    case 'prefix':
      return prefixBreadth(pattern);
    case 'contains':
      // 부분 문자열은 도메인처럼 읽히는 조각을 품을 때만 호스트에 묶인다.
      return hasDomainLikeToken(pattern) ? 'narrow' : 'wide';
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
  const afterScheme = pattern.slice(separator + 3);
  const host = afterScheme.split('/')[0] ?? '';
  return isConcreteHost(host) ? 'narrow' : 'wide';
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
  try {
    new RegExp(pattern.replace(RE2_INLINE_FLAGS, ''));
  } catch {
    return 'invalid';
  }
  // 정규식은 메타문자를 빼고 **리터럴로 남는 부분**만 도메인 판정에 쓴다. `\.`는 리터럴
  // 점이므로 되살리고, `.`·`*` 같은 메타문자는 도메인 조각을 만들어 내지 못하게 둔다.
  const literals = pattern.replace(/\\\./g, '.');
  return hasDomainLikeToken(literals) ? 'narrow' : 'wide';
}
