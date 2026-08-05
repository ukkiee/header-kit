/**
 * 세 입력의 제안 (ADR 0017의 유일한 예외, 티켓 08) — 헤더 이름·쿠키 이름·User-Agent.
 *
 * 셋이 **한 구조**를 쓴다: 프리셋 사전 + 사용 이력, 이력이 앞. 같은 규칙을 세 번 구현하면
 * 한쪽만 고쳐지는 날이 오고, 그때 사용자는 같은 자리에서 다르게 동작하는 입력들을 갖는다.
 *
 * 순수 함수라 사전·이력·쿼리만으로 결정된다.
 */

/**
 * 제안이 쓰는 **사용 이력 셋** — 사용자가 직접 친 값들이다 (프리셋 사전은 이 모듈이 든다).
 *
 * 셋을 한 덩이로 나르는 이유는 늘 함께 다니기 때문이다. 따로 나르면 층을 지날 때마다 프롭이
 * 셋씩 늘고, 넷째가 생기는 날 그 층들을 전부 다시 고쳐야 한다.
 */
export interface SuggestionHistory {
  headerNames: readonly string[];
  cookieNames: readonly string[];
  userAgents: readonly string[];
}

/** 아무것도 친 적 없는 상태 — 스토리·테스트가 프리셋만으로 그릴 때 쓴다. */
export const EMPTY_SUGGESTION_HISTORY: SuggestionHistory = {
  headerNames: [],
  cookieNames: [],
  userAgents: [],
};

/** 제안 하나 — **보여 주는 것**과 **넣는 것**을 따로 든다. */
export interface Suggestion {
  label: string;
  value: string;
}

/** 흔한 요청/응답 헤더 표준 사전 (소문자 정규화 비교, 표시용 원형). */
export const STANDARD_HEADERS = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Content-Type',
  'Cookie',
  'Origin',
  'Referer',
  'User-Agent',
  'X-Forwarded-For',
  'X-Requested-With',
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Headers',
  'Content-Security-Policy',
  'Set-Cookie',
  'Strict-Transport-Security',
] as const;

/**
 * 흔한 쿠키 이름 사전 (티켓 08).
 *
 * 개발 중에 실제로 손대게 되는 것들이다 — 세션·인증·동의·실험 배정. 서버가 정하는 이름이라
 * 표준은 없고, 여기 있는 것은 "자주 마주치는 이름"이지 규격이 아니다.
 */
export const COMMON_COOKIE_NAMES = [
  'session_id',
  'sessionid',
  'sid',
  'access_token',
  'refresh_token',
  'auth_token',
  'csrftoken',
  'XSRF-TOKEN',
  'JSESSIONID',
  'PHPSESSID',
  'locale',
  'theme',
  'consent',
  'ab_variant',
] as const;

/**
 * 미리 준비된 User-Agent 문자열 (티켓 08, story 39).
 *
 * **라벨과 값이 다른 유일한 사전이다.** UA 문자열은 길어 접두 필터가 맞지 않고(사용자는
 * `Mozilla/5.0`을 치지 않는다) 외워서 칠 수 있는 것도 아니라, 사람이 아는 이름으로 찾게 하고
 * 넣는 것은 전체 문자열이다.
 */
export const USER_AGENT_PRESETS: readonly Suggestion[] = [
  {
    label: 'Chrome (Windows)',
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  },
  {
    label: 'Chrome (macOS)',
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  },
  {
    label: 'Safari (macOS)',
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  },
  {
    label: 'Safari (iPhone)',
    value:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    label: 'Chrome (Android)',
    value:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
  },
  {
    label: 'Firefox (Windows)',
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  },
  {
    label: 'Googlebot',
    value: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  },
  { label: 'curl', value: 'curl/8.6.0' },
];

/**
 * 이력 + 프리셋을 합쳐 쿼리로 거른다 — 세 제안이 공유하는 몸통.
 *
 * 이력이 앞이고, 대소문자를 무시해 **값 기준**으로 중복을 지운다. 라벨이 아니라 값으로 지우는
 * 이유는 UA 때문이다: 직접 친 UA가 프리셋과 같은 문자열이면 라벨은 달라도 같은 항목이라,
 * 라벨로 지우면 목록에 같은 UA가 두 번 선다.
 *
 * 거르는 대상은 **라벨**이다 — 헤더·쿠키는 라벨이 곧 값이라 차이가 없고, UA는 사람이 아는
 * 이름으로 찾아야 한다.
 */
function suggestFrom(query: string, pool: readonly Suggestion[], limit: number): Suggestion[] {
  /*
   * 값이 겹치면 **자리는 앞선 쪽, 라벨은 사람이 붙인 쪽**을 쓴다.
   *
   * 앞선 쪽을 그냥 남기면 UA에서 라벨이 사라진다: 이력에 프리셋과 같은 문자열이 있으면
   * (예전 상태·가져오기로 도달 가능하다) 이력 항목은 값이 곧 라벨이라, 목록에
   * `Chrome (Windows)` 대신 `Mozilla/5.0 …` 한 줄이 선다 — 라벨로 찾게 한 이유가 사라진다.
   */
  const seen = new Map<string, number>();
  const unique: Suggestion[] = [];
  for (const item of pool) {
    const key = item.value.toLowerCase();
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, unique.length);
      unique.push(item);
      continue;
    }
    const kept = unique[at]!;
    if (kept.label === kept.value && item.label !== item.value) unique[at] = { ...kept, label: item.label };
  }

  const q = query.trim().toLowerCase();
  if (q === '') return unique.slice(0, limit);

  const prefix: Suggestion[] = [];
  const partial: Suggestion[] = [];
  for (const item of unique) {
    const label = item.label.toLowerCase();
    // 이미 정확히 입력된 값은 제안하지 않는다 — 고를 것이 자기 자신이면 목록이 소음이다.
    if (item.value.toLowerCase() === q) continue;
    if (label.startsWith(q)) prefix.push(item);
    else if (label.includes(q)) partial.push(item);
  }
  return [...prefix, ...partial].slice(0, limit);
}

/** 라벨이 곧 값인 사전 — 헤더·쿠키가 쓴다. */
const asSuggestions = (names: readonly string[]): Suggestion[] =>
  names.map((name) => ({ label: name, value: name }));

/** 쿼리에 맞는 헤더 이름 후보 — 사용자 항목이 표준보다 앞선다. */
export function suggestHeaderNames(
  query: string,
  userHeaders: readonly string[] = [],
  limit = 8,
): Suggestion[] {
  return suggestFrom(query, asSuggestions([...userHeaders, ...STANDARD_HEADERS]), limit);
}

/** 쿼리에 맞는 쿠키 이름 후보 — 사용 이력이 사전보다 앞선다. */
export function suggestCookieNames(
  query: string,
  userCookieNames: readonly string[] = [],
  limit = 8,
): Suggestion[] {
  return suggestFrom(query, asSuggestions([...userCookieNames, ...COMMON_COOKIE_NAMES]), limit);
}

/**
 * 쿼리에 맞는 User-Agent 후보 — 라벨로 찾고 값을 넣는다.
 *
 * 직접 친 UA는 **자기 자신이 라벨**이다. 사람이 붙인 이름이 없으므로 값을 그대로 보여 주는
 * 것 말고는 그것을 가리킬 방법이 없다.
 */
export function suggestUserAgents(
  query: string,
  userAgents: readonly string[] = [],
  limit = 8,
): Suggestion[] {
  return suggestFrom(query, [...asSuggestions(userAgents), ...USER_AGENT_PRESETS], limit);
}
