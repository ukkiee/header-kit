import type { UrlMatchType } from './model';

/**
 * URL 스코프가 얼마나 넓은지의 판정 (ADR 0015, 티켓 04).
 *
 * `wide`는 "잘못됐다"가 아니라 **"어느 호스트에도 묶여 있지 않다"**는 사실 진술이다. 넓은
 * 스코프의 Block은 사용자가 정말 원한 것일 수도 있으므로(모든 광고 도메인을 한 번에 막는 식)
 * **아무것도 막지 않는다** — 예전에는 폼이 여기에 확인을 한 번 더 받았지만 ADR 0017이 그
 * 단계를 걷었다. 지금 이 값을 읽는 프로덕션 경로는 없고, 판정 자체는 다음 소비자를 위해
 * 그대로 둔다(수용 기준). 반대로 `invalid`는 그 패턴으로는 브라우저
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
 * 값을 어느 문법으로 읽을지 — ADR 0008의 컴파일 매핑이 정한다. `regex`만 `regexFilter`로
 * 내려가고 `contains`·`prefix`는 DNR의 **비정규식** `urlFilter`로 내려가므로, 후자에서
 * `[`·`\`는 특수문자가 아니라 평범한 글자다.
 */
type Reading = 'literal' | 'regex';

/**
 * 패턴 문자열의 **authority 구간** — 스킴 구분자 뒤부터 첫 구분자(`/`·`?`·`#`) 앞까지,
 * 스킴 구분자가 없으면 첫 구분자 앞 전체 (릴리스 R-1, 티켓 05).
 *
 * 이 구간만 보는 이유는 경로·쿼리에 있는 도메인꼴 조각이 호스트 노릇을 하지 못하게 하는
 * 것이다 — 그것이 릴리스 r3의 R-1이었다.
 *
 * **스킴 구분자를 문자열 어디서나 찾으면 안 된다.** 리다이렉트를 막는 흔한 모양
 * (`^https?:\/\/[^\/]+\/u=https://ads\.example\.com\/`)에는 `://`가 **쿼리 안에** 있고, 그것을
 * 집으면 쿼리의 도메인이 호스트로 세어져 모든 호스트에 걸리는 패턴이 '좁음'으로 통과한다.
 * 그래서 왼쪽부터 한 번만 훑는다 — 구분자를 먼저 만나면 거기서 끝나므로 구분자 뒤의 `://`에는
 * 애초에 닿지 못한다.
 *
 * **두 독법으로 갈리는 이유.** 리터럴 값에서 `[`를 문자 클래스로 읽으면 그 안쪽의 `/`를
 * 구분자로 세지 않게 되어, 경로 조각만 든 부분 문자열이 '좁음'으로 통과한다. 반대로 정규식에서
 * 맨 `?`를 쿼리 구분자로 읽으면 그것이 수량자인 패턴(`(ads\.)?example\.com`)이 넓다고 판정된다.
 * 한 잣대로 둘을 재면 어느 쪽이든 한 방향이 틀린다.
 */
function authoritySpan(text: string, reading: Reading): string {
  let from = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    // 정규식에서 이스케이프는 한 단위다. `\/`·`\?`·`\#`는 리터럴 구분자라 거기서 끊고, 그 밖의
    // 이스케이프는 통째로 건너뛴다 — 건너뛰지 않으면 `\\?`(리터럴 역슬래시 + 수량자)의 `?`를
    // 이스케이프된 구분자로 잘못 읽는다.
    if (reading === 'regex' && ch === '\\') {
      const escaped = text[i + 1];
      if (escaped === '/' || escaped === '?' || escaped === '#') return text.slice(from, i);
      i += 2;
      continue;
    }
    // `from === 0`은 "아직 스킴 구분자를 만나지 못했다"를 겸한다 — 만나면 `from`이 최소 3이
    // 되므로 0으로 돌아오는 길이 없고, 그래서 두 번째 `://`는 구분자로 세어지지 않는다.
    if (from === 0 && text.startsWith('://', i)) {
      i += 3;
      from = i;
      continue;
    }
    // 맨 `?`는 정규식에서 수량자다. 리터럴에서만 쿼리 구분자로 센다.
    if (ch === '/' || ch === '#' || (reading === 'literal' && ch === '?')) {
      return text.slice(from, i);
    }
    i += 1;
  }
  return text.slice(from);
}

/**
 * 이 문자열이 **어떤 호스트에 묶여 있는가**. 판정 전체가 이 질문 하나로 굴러간다.
 *
 * 받는 것은 authority 구간이다 — 도메인꼴 조각이 있는지만 보면 안 되기 때문이다.
 * `tracker.js`도, 경로에 도메인이 섞인 `^https?://[^/]+/ads\.js`도 문자열 전체를 훑으면
 * 그 검사를 통과하지만 둘 다 모든 호스트에 걸린다. 구간을 좁힌 뒤에도 (1) `/`·`:`·`?`·끝으로
 * **닫히는** 자리에 있고, (2) 실제 라벨이 둘 이상이며, (3) 마지막 라벨이 파일 확장자가
 * 아닐 때만 호스트로 인정한다.
 *
 * **남는 한계** (스펙 D1). 이 판정이 증명하는 것은 **패턴 문자열 안에서의 위치**이지 실제 URL
 * 안에서의 위치가 아니다. 앵커 없는 부분 문자열 스코프 `ads.example.com/path`는 좁음으로
 * 판정되지만 `https://victim.test/ads.example.com/path`에도 매칭된다. 같은 이유로 `&d=…`처럼
 * 쿼리 파라미터 구분자로 시작하는 값도 좁음이다 — `?`·`#`은 RFC 3986의 구분자라 자리를
 * 증명하지만 `&`는 userinfo의 sub-delim으로도 허용되어 증명하지 못하고, 이 값들에는 스킴
 * 구분자가 없어 위치를 고정할 근거가 문자열 안에 없다. 플랜 게이트 r1이 이
 * 구멍을 닫으라고 권고했고 처방 자체는 정확했지만, 어느 형태로 조여도 기존 판정 아홉 행이
 * 뒤집히고 그중 셋이 `contains`인데 ADR 0008이 폼 기본값을 `contains`로 정했다 — 판정이
 * 상시가 되면 사용자는 읽지 않고 누르고, 그러면 진짜 넓은 규칙에 대해서도 가드레일이 작동을
 * 멈춘다. 가드레일을 켜서 끄는 셈이라 사람이 reject했고, 이 판정이 순수 함수라 나중에 조이는
 * 비용이 낮다는 점도 근거다.
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
      // 도메인 매치는 **값 자체가 호스트**다 — 값 전체를 authority로 본다.
      return isHostBound(pattern) ? 'narrow' : 'wide';
    case 'prefix':
      return prefixBreadth(pattern);
    case 'contains':
      // 부분 문자열은 authority 자리에 놓인 도메인을 품을 때만 묶인다 — 경로·쿼리 조각만 든
      // 값은 모든 호스트의 그 자리에 걸린다.
      return isHostBound(authoritySpan(pattern, 'literal')) ? 'narrow' : 'wide';
    case 'regex':
      return regexBreadth(pattern);
  }
}

/** 접두 매치 — 스킴 뒤 호스트 자리까지 닿아야 좁다(`https://`만으로는 전부다). */
function prefixBreadth(pattern: string): ScopeBreadth {
  if (!pattern.includes('://')) {
    // 스킴 구분자에 닿지 못한 접두(`http`, `*`)는 호스트를 특정하지 못한다. 접두는 URL 시작에
    // 앵커되므로(ADR 0008: `|패턴`) 스킴 없이 시작하는 URL은 존재하지 않는다.
    return 'wide';
  }
  // `contains`와 **같은 리터럴 독법**을 쓴다 — ADR 0008이 둘을 같은 부류(비정규식 `urlFilter`)로
  // 내려보내므로, authority를 재는 잣대가 갈리면 같은 문자열이 두 방식에서 반대로 판정된다.
  return isHostBound(authoritySpan(pattern, 'literal')) ? 'narrow' : 'wide';
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

/**
 * 전개된 갈래 수의 상한 (release R2-1).
 *
 * 전개는 그룹마다 **곱셈**이다 — `(a|b)(c|d)…`는 갈래가 지수로 늘어난다. 이 판정은
 * 폼 입력마다 도는 자리라 상한이 없으면 사용자가 친 정규식 하나가 UI를 멈춰 세울 수
 * 있다. 넘으면 세지 않고 '넓음'으로 떨어뜨린다 — 판정을 포기할 때 넓다고 말하는 쪽이
 * 안전한 실패다(`wide`는 금지가 아니라 "호스트에 묶여 있지 않다"는 사실 진술이다).
 */
const MAX_EXPANDED_BRANCHES = 64;

/** 전개 실패·포기를 나타내는 표식 — 호출부는 이것을 보면 '넓음'으로 떨어뜨린다. */
const GIVE_UP = null;
type Branches = string[] | typeof GIVE_UP;

/** 수량자 — 대안 그룹 바로 뒤에 붙으면 전개가 그 의미를 표현하지 못한다. */
const QUANTIFIER_START = new Set(['*', '+', '?', '{']);

interface Parsed {
  branches: string[];
  /** 파싱이 멈춘 위치 — 그룹이면 닫는 `)`의 인덱스, 최상위면 문자열 끝. */
  next: number;
}

/** 두 갈래 목록의 데카르트 곱 — 문맥이 각 갈래에 복사되는 자리다. */
function concatBranches(left: string[], right: string[]): Branches {
  if (left.length * right.length > MAX_EXPANDED_BRANCHES) return GIVE_UP;
  const out: string[] = [];
  for (const l of left) for (const r of right) out.push(l + r);
  return out;
}

/** 원문 그대로 실리는 조각 하나 — 이스케이프·문자 클래스·`|` 없는 그룹이 여기로 온다. */
function literal(text: string): string[] {
  return [text];
}

/** `[...]`의 끝 — 안쪽의 `|`는 대안이 아니다. */
function endOfClass(pattern: string, start: number): number {
  for (let i = start + 1; i < pattern.length; i += 1) {
    if (pattern[i] === '\\') i += 1;
    else if (pattern[i] === ']') return i;
  }
  return -1;
}

/** 여는 `(`에 대응하는 `)` — 중첩·이스케이프·문자 클래스를 넘어간다. */
function endOfGroup(pattern: string, start: number): number {
  let depth = 0;
  for (let i = start; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '\\') i += 1;
    else if (ch === '[') {
      const close = endOfClass(pattern, i);
      if (close === -1) return -1;
      i = close;
    } else if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 정규식을 **문맥을 분배해** 갈래 목록으로 편다 (release R2-1).
 *
 * 최상위 `|`만 자르면 그룹이 조각 하나가 되어, 그 안의 호스트꼴 토큰 하나가 옆 갈래까지
 * 대신 증명한다 — `^(https://ads\.example\.net/|https://.*\.com/)`가 '좁음'으로 통과한
 * 경로다. 그렇다고 모든 `|`를 그냥 자르면 반대로 `^https://(ads|cdn)\.example\.com/`가
 * `^https://(ads`와 `cdn)\.example\.com/`로 **찢어져** 멀쩡한 패턴이 '넓음'이 된다.
 * 그래서 자르는 것이 아니라 **편다**: 그룹 앞뒤의 문맥을 각 갈래에 복사한다.
 *
 * 표현할 수 없는 모양(갈래 상한 초과·대안 그룹 뒤 수량자·괄호 불일치)에서는 `null`을
 * 돌려주고, 호출부는 그것을 '넓음'으로 읽는다 — 포기가 '좁음'이 되는 길은 없다.
 */
function expandAlternatives(pattern: string, start: number, inGroup: boolean): Parsed | null {
  const done: string[] = [];
  let current: string[] = [''];
  let i = start;

  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === ')') {
      if (!inGroup) return null; // 괄호 불일치 — 파싱 실패
      break;
    }
    if (ch === '|') {
      done.push(...current);
      if (done.length > MAX_EXPANDED_BRANCHES) return null;
      current = [''];
      i += 1;
      continue;
    }

    let atom: string[];
    if (ch === '\\') {
      atom = literal(pattern.slice(i, i + 2));
      i += 2;
    } else if (ch === '[') {
      const close = endOfClass(pattern, i);
      if (close === -1) return null;
      atom = literal(pattern.slice(i, close + 1));
      i = close + 1;
    } else if (ch === '(') {
      const close = endOfGroup(pattern, i);
      if (close === -1) return null;
      const raw = pattern.slice(i, close + 1);
      const body = pattern.slice(i + 1, close);
      // `(?:`만 전개한다. `(?i)`·이름 붙은 그룹 같은 특수 그룹은 원문 그대로 싣되,
      // 그 안에 대안이 숨어 있으면 증명할 수 없으므로 물러난다.
      const special = body.startsWith('?') && !body.startsWith('?:');
      if (special) {
        const inner = expandAlternatives(pattern, i + 1, true);
        if (inner === null || inner.branches.length > 1) return null;
        atom = literal(raw);
      } else {
        const inner = expandAlternatives(pattern, i + (body.startsWith('?:') ? 3 : 1), true);
        if (inner === null || inner.next !== close) return null;
        // 대안이 없는 그룹은 **원문 그대로** 싣는다 — 괄호를 벗기면 뒤따르는 수량자가
        // 걸리는 대상이 바뀐다(`(ads\.example\.com)?`의 `?`는 그룹 전체에 걸린다).
        atom = inner.branches.length === 1 ? literal(raw) : inner.branches;
      }
      i = close + 1;
      // 갈래가 여럿인 그룹 뒤의 수량자는 "그룹이 통째로 빠진" 문자열까지 매칭시킨다 —
      // 전개된 갈래 어디에도 그 모양이 없으므로 증명하지 못한다.
      if (atom.length > 1 && QUANTIFIER_START.has(pattern[i] ?? '')) return null;
    } else {
      atom = literal(ch);
      i += 1;
    }

    const next = concatBranches(current, atom);
    if (next === GIVE_UP) return null;
    current = next;
  }

  if (inGroup && pattern[i] !== ')') return null; // 닫히지 않은 그룹
  done.push(...current);
  if (done.length > MAX_EXPANDED_BRANCHES) return null;
  return { branches: done, next: i };
}

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
  // 대안은 각자 매칭되므로 **모든** 갈래가 호스트에 묶였음을 증명해야 좁다 —
  // `^https://.*\.com/|ads\.example\.net`은 오른쪽만 보면 좁지만 왼쪽이 모든 .com을 삼킨다.
  // 그룹 안에 숨은 갈래도 같다(R2-1) — 그래서 자르지 않고 문맥을 분배해 편다.
  // `\.`는 리터럴 점이라 되살리고, `.`·`*` 같은 메타문자는 도메인 조각을 만들지 못하게 둔다.
  const expanded = expandAlternatives(pattern, 0, false);
  if (expanded === null) return 'wide'; // 포기 경로는 전부 넓음 — '좁음'으로 새지 않는다
  // 갈래마다 **자기 authority 구간**을 본다. 구간을 먼저 자르고 나서 `\.`를 리터럴 점으로
  // 되살리는 순서가 중요하다 — 자르는 동안에는 이스케이프가 온전해야 `\/`를 경로 구분자로,
  // `\.`를 구분자 아닌 것으로 읽을 수 있다.
  return expanded.branches.every((alt) =>
    isHostBound(authoritySpan(alt, 'regex').replace(/\\\./g, '.')),
  )
    ? 'narrow'
    : 'wide';
}
