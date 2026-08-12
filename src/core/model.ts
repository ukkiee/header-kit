import type { Locale } from './i18n';
import type { RequestMethod, ResourceType } from './rules';
import { DEFAULT_THEME, type ThemePreference } from './theme';

/**
 * 포맷 버전은 의존성 없는 `format-version.ts`가 소유한다 — 스모크가 그 파일을 직접
 * import하기 때문이다(사정은 그쪽 주석 참고). 여기서는 내부에서 쓰면서 기존 import
 * 경로(`@/core/schema`)를 지키려고 다시 내보낸다.
 */
import { SCHEMA_VERSION } from './format-version';

export { SCHEMA_VERSION };

/**
 * Modification은 종류를 판별자(kind)로 갖는 discriminated union이다.
 * 후속 슬라이스는 이 union에 variant를 추가할 뿐, Profile의 공개 계약
 * (ordered modifications 컬렉션)은 바뀌지 않는다.
 */
/** 기존 값을 통째 대체(override)하거나 뒤에 덧붙인다(append). */
/** 규칙 URL 필터의 매치 방식 (ADR 0008) — 부재 = regex(하위 호환). */
export type UrlMatchType = 'domain' | 'contains' | 'prefix' | 'regex';

/**
 * 규칙의 적용 조건 (ADR 0010) — 프로필 필터를 대체하는 규칙 단위 조건.
 * 전부 선택 필드이고, DNR 조건으로 직접 컴파일된다.
 *
 * **퇴역한 넷이 타입에 남아 있는 것은 의도다** (ADR 0017, 티켓 02). 저장소에서는 업그레이드가
 * 이미 걷어 갔지만, 걷어 가기 **직전**의 값을 표현할 자리가 필요하다 — 진짜 v1 상태에는 규칙
 * 조건이 없고 레거시 필터 실체화가 이 필드들을 만들어 내므로, 타입에서 빼면 그 산출물을
 * 담을 수 없다.
 *
 * **철거 뒤에도 남는다** (티켓 10). 이 필드들을 읽던 서브시스템(만료 알람·탭 감시)은 그
 * 티켓에서 사라졌지만 타입은 남았다 — 없애려면 레거시 필터 실체화(`persist.ts`의
 * `migrateProfileFilters`)가 이 필드들을 만들어 내는 것부터 바꿔야 하고, 그것은 옛 상태를
 * 읽는 계약이라 또 한 번의 버전 경계 뒤에서 할 일이다(스펙 Out of Scope와 같은 이유).
 */
export interface RuleConditions {
  /** 퇴역 (ADR 0017) — 업그레이드 입력에만 나타난다. 이 도메인들의 요청에는 적용하지 않았다. */
  excludedDomains?: string[];
  resourceTypes?: ResourceType[];
  requestMethods?: RequestMethod[];
  /** 퇴역 (ADR 0017) — 업그레이드 입력에만 나타난다. 요청 출처(origin) 도메인 매칭. */
  initiatorDomains?: string[];
  /** 퇴역 (ADR 0017) — 업그레이드 입력에만 나타난다. 이 도메인 탭에서 나가는 요청에만 적용. */
  tabDomains?: string[];
  /** 퇴역 (ADR 0017) — 업그레이드 입력에만 나타난다. 자동 해제 시각(epoch ms). */
  expiresAt?: number;
}

/**
 * 조건 객체 정리 — 빈 필드는 벗기고, 전부 비면 undefined.
 *
 * **퇴역한 넷은 여기를 지나지 못한다** (ADR 0017, 티켓 02). 벗기기와 같은 변경에서 사라지는
 * 것이 중요하다: 분기를 남기면 낡은 값이 화면에 보이지 않은 채 저장소에서 계속 살아남고,
 * 벗기기 없이 분기만 지우면 무관한 저장 한 번에 그 값이 조용히 사라진다 — 그때는 규칙이
 * 넓어졌다고 알릴 자리도 없다.
 */
export function normalizeConditions(conditions: RuleConditions): RuleConditions | undefined {
  const next: RuleConditions = {};
  if (conditions.resourceTypes?.length) next.resourceTypes = conditions.resourceTypes;
  if (conditions.requestMethods?.length) next.requestMethods = conditions.requestMethods;
  return Object.keys(next).length > 0 ? next : undefined;
}

export type HeaderMode = 'override' | 'append';
/** 값이 비었을 때의 의미 — 헤더 제거 vs 빈 값 전송. */
export type EmptyValueMeaning = 'remove' | 'send-empty';

interface HeaderModificationBase {
  id: string;
  /** Header name, e.g. "X-Debug". */
  name: string;
  /** Value template. Placeholder는 활성화 경계에서 실체화된다. */
  value: string;
  mode: HeaderMode;
  /** 값이 빈 문자열일 때의 처리. */
  emptyMeans: EmptyValueMeaning;
  comment: string;
  enabled: boolean;
  /** 이 규칙만의 URL 필터 — 있으면 프로필 URL 필터를 대체한다 (ADR 0007). */
  urlFilter?: string;
  /** urlFilter의 매치 방식 (ADR 0008) — 부재 = regex. */
  urlMatchType?: UrlMatchType;
  /** 적용 조건 (ADR 0010) — 없으면 무조건 적용. */
  conditions?: RuleConditions;
}

export interface RequestHeaderModification extends HeaderModificationBase {
  kind: 'request-header';
}

export interface ResponseHeaderModification extends HeaderModificationBase {
  kind: 'response-header';
}

/**
 * Request Cookie — Cookie 요청 헤더를 수정한다 (ADR-0001: 헤더 레벨만).
 * append: 기존 Cookie에 `name=value` 추가. override: Cookie 헤더를 통째 교체.
 * 빈 값 + remove: Cookie 헤더 제거.
 */
export interface CookieModification {
  kind: 'cookie';
  id: string;
  /** 쿠키 이름. append 시 `name=value`로 합성된다. */
  name: string;
  value: string;
  mode: HeaderMode;
  emptyMeans: EmptyValueMeaning;
  comment: string;
  enabled: boolean;
  /** 이 규칙만의 URL 필터 — 있으면 프로필 URL 필터를 대체한다 (ADR 0007). */
  urlFilter?: string;
  /** urlFilter의 매치 방식 (ADR 0008) — 부재 = regex. */
  urlMatchType?: UrlMatchType;
  /** 적용 조건 (ADR 0010) — 없으면 무조건 적용. */
  conditions?: RuleConditions;
}

/** SameSite 정책 — 붙이지 않을 때는 필드 자체가 없다. */
export type SameSitePolicy = 'none' | 'lax' | 'strict';

/** 조립된 쿠키 한 줄의 재료. Modification과 따로 두어 파서·조립기가 둘 다 이것만 안다. */
export interface SetCookieParts {
  /** 쿠키 이름. 원시 보존 항목은 빈 문자열이다. */
  name: string;
  value: string;
  domain?: string;
  path?: string;
  maxAge?: string;
  sameSite?: SameSitePolicy;
  secure?: boolean;
  httpOnly?: boolean;
}

/** 라벨이자 **허용 집합의 단일 출처** — 값을 늘리면 검증·조립·파싱이 함께 따라온다. */
export const SAME_SITE_LABEL: Record<SameSitePolicy, string> = {
  none: 'None',
  lax: 'Lax',
  strict: 'Strict',
};

/**
 * 재료로 Set-Cookie 한 줄을 조립한다 (ADR 0017). 비운 속성은 붙지 않는다.
 *
 * 순서가 고정인 것이 중요하다 — `parseSetCookieLine`이 이 함수로 되돌려 원본과
 * 글자까지 같은지 보는 것으로 "나가는 헤더가 같다"를 보증하기 때문이다.
 */
export function assembleSetCookie(parts: SetCookieParts): string {
  const segments = [`${parts.name}=${parts.value}`];
  if (parts.domain) segments.push(`Domain=${parts.domain}`);
  if (parts.path) segments.push(`Path=${parts.path}`);
  if (parts.maxAge) segments.push(`Max-Age=${parts.maxAge}`);
  if (parts.sameSite) segments.push(`SameSite=${SAME_SITE_LABEL[parts.sameSite]}`);
  if (parts.secure) segments.push('Secure');
  if (parts.httpOnly) segments.push('HttpOnly');
  return segments.join('; ');
}

/**
 * Response Cookie — Set-Cookie 응답 헤더에 쿠키 한 줄을 **얹는다** (ADR-0001, ADR 0017).
 *
 * v3부터 `value`는 **쿠키의 값**이고, 이름·속성은 옆 필드가 든다. v2에서는 `value`가
 * Set-Cookie 한 줄 전체였다 — 같은 필드의 뜻이 바뀌었으므로 그 경계가 v3다.
 *
 * 서버가 보낸 쿠키를 **고치는 것이 아니라 대신 놓는 것**이다. 브라우저에 헤더 값의 부분
 * 수정이 없어서(ADR 0001) "서버 쿠키에서 Secure만 벗기기"는 이 종류로도 할 수 없다.
 */
interface SetCookieBase {
  kind: 'set-cookie';
  id: string;
  mode: HeaderMode;
  emptyMeans: EmptyValueMeaning;
  comment: string;
  enabled: boolean;
  /** 이 규칙만의 URL 필터 — 있으면 프로필 URL 필터를 대체한다 (ADR 0007). */
  urlFilter?: string;
  /** urlFilter의 매치 방식 (ADR 0008) — 부재 = regex. */
  urlMatchType?: UrlMatchType;
  /** 적용 조건 (ADR 0010) — 없으면 무조건 적용. */
  conditions?: RuleConditions;
}

/** 재료로 조립해 얹는 보통의 응답 쿠키. */
export interface StructuredSetCookieModification extends SetCookieBase, SetCookieParts {
  raw?: undefined;
}

/**
 * 가를 수 없어 옛 Set-Cookie 한 줄을 **그대로** 보존한 응답 쿠키 (ADR 0017).
 *
 * 구조화 재료를 **아예 갖지 않는** 것이 이 변형의 요점이다. 옛 코드는 raw를 선택 필드로
 * 얹었는데, 그러면 저장소가 두 표현을 동시에 든 레코드를 받아들이고 컴파일은 raw를
 * 우선한다 — 폼이 이름·속성을 고쳐 저장하고 "성공"이라 말한 뒤에도 옛 줄이 계속 나가는
 * 경로가 열린다. 하나만 있을 수 있게 타입으로 못박아 그 상태를 표현조차 못 하게 한다.
 *
 * 벗어나는 길은 `toStructuredSetCookie` 하나뿐이고, 그것은 raw를 **지우면서** 나간다.
 */
export interface RawSetCookieModification extends SetCookieBase {
  raw: string;
  name?: undefined;
  value?: undefined;
  domain?: undefined;
  path?: undefined;
  maxAge?: undefined;
  sameSite?: undefined;
  secure?: undefined;
  httpOnly?: undefined;
}

export type SetCookieModification = StructuredSetCookieModification | RawSetCookieModification;

/** 원시 보존 항목인가 — 컴파일·요약·폼이 같은 술어를 쓴다. */
export function isRawSetCookie(
  modification: SetCookieModification,
): modification is RawSetCookieModification {
  return modification.raw !== undefined;
}

/**
 * 원시 보존 항목을 구조화 변형으로 옮기는 **유일한 문** (ADR 0017).
 *
 * raw를 지우면서 나가므로, 옮긴 뒤에는 옛 줄이 남아 새 재료를 덮을 수 없다.
 */
export function toStructuredSetCookie(
  modification: SetCookieModification,
  parts: SetCookieParts,
): StructuredSetCookieModification {
  const { raw: _dropped, ...rest } = modification;
  return { ...rest, ...parts, raw: undefined };
}

/** Redirect — regex 매칭 + 캡처 그룹 치환으로 URL을 재작성한다. */
export interface RedirectModification {
  kind: 'redirect';
  id: string;
  /** 적용 조건 (ADR 0010) — 없으면 무조건 적용. */
  conditions?: RuleConditions;
  /** 매칭 regex (regexFilter). */
  pattern: string;
  /** 치환 문자열. `\1`~`\9` 캡처 그룹 (regexSubstitution). */
  substitution: string;
  comment: string;
  enabled: boolean;
}

/**
 * User-Agent — `User-Agent` 요청 헤더를 바꾼다 (ADR 0015).
 *
 * Request Header의 특수 케이스지만 별도 종류로 둔다: 헤더 이름이 고정이라 폼이 값 하나만
 * 받으면 되고, 행 요약·뱃지도 "UA"로 다르게 읽힌다. 이름을 사용자에게 물으면 오타로
 * 조용히 동작하지 않는 규칙이 생긴다.
 */
export interface UserAgentModification {
  kind: 'user-agent';
  id: string;
  /** 보낼 User-Agent 문자열. */
  value: string;
  comment: string;
  enabled: boolean;
  /** 이 규칙만의 URL 필터 (ADR 0007). */
  urlFilter?: string;
  /** urlFilter의 매치 방식 (ADR 0008) — 부재 = regex. */
  urlMatchType?: UrlMatchType;
  /** 적용 조건 (ADR 0010) — 없으면 무조건 적용. */
  conditions?: RuleConditions;
}

/**
 * Header Removal — 이름이 같은 헤더를 **요청·응답 양쪽에서** 제거한다 (ADR 0015).
 *
 * 디자인이 req/res를 구분하지 않는 한 종류로 두었으므로, 규칙 하나가 removeHeaders를
 * 양쪽에 낸다. 사용자는 "이 헤더를 없앤다"만 말하면 되고 어느 방향인지 몰라도 된다.
 * (요청 헤더만 지우려면 Request Header 종류에 빈 값 + emptyMeans:'remove'를 쓴다 —
 * 그 경로는 그대로 유효한 별도 어포던스다.)
 */
export interface HeaderRemovalModification {
  kind: 'header-removal';
  id: string;
  /** 제거할 헤더 이름. */
  name: string;
  comment: string;
  enabled: boolean;
  /** 이 규칙만의 URL 필터 (ADR 0007). */
  urlFilter?: string;
  /** urlFilter의 매치 방식 (ADR 0008) — 부재 = regex. */
  urlMatchType?: UrlMatchType;
  /** 적용 조건 (ADR 0010) — 없으면 무조건 적용. */
  conditions?: RuleConditions;
}

/**
 * Block — 매칭된 요청을 아예 차단한다 (ADR 0015).
 *
 * 이름도 값도 없다. 무엇을 막을지는 **오직 URL 스코프와 Condition**이 정하므로, 이 종류에서
 * 스코프는 선택 필드가 아니라 규칙의 전부다 — 스코프가 없으면 "모든 요청을 막는다"가 되고,
 * 그건 사용자가 의도할 수 있는 값이 아니라 실수의 모양이다. 검증이 스코프를 필수로 요구하고
 * compile이 스코프 없는 Block을 방출하지 않는 것은 같은 이유의 두 방어선이다.
 */
export interface BlockModification {
  kind: 'block';
  id: string;
  comment: string;
  enabled: boolean;
  /** 차단 대상 URL (ADR 0007) — 이 종류에서는 사실상 필수다. */
  urlFilter?: string;
  /** urlFilter의 매치 방식 (ADR 0008) — 부재 = regex. */
  urlMatchType?: UrlMatchType;
  /** 적용 조건 (ADR 0010) — 없으면 스코프에 걸리는 모든 요청. */
  conditions?: RuleConditions;
}

export type Modification =
  | RequestHeaderModification
  | ResponseHeaderModification
  | CookieModification
  | SetCookieModification
  | RedirectModification
  | UserAgentModification
  | HeaderRemovalModification
  | BlockModification;

/**
 * Placeholder 실체화 대상이 되는 값 문자열 (없으면 null).
 * 값이 있는 종류(header/cookie/set-cookie)만 Placeholder를 지원한다 —
 * redirect는 지원하지 않는다.
 */
export function placeholderTemplate(modification: Modification): string | null {
  switch (modification.kind) {
    case 'request-header':
    case 'response-header':
    case 'cookie':
    // User-Agent도 값을 가진 종류다 — {{uuid}} 같은 토큰을 UA 문자열에 넣을 수 있다.
    case 'user-agent':
      return modification.value;
    /*
     * 응답 쿠키의 실체화 대상은 **나가는 줄과 같은 문자열**이어야 한다 (ADR 0017).
     * 원시로 보존된 항목은 그 줄이 그대로 나가므로 값이 아니라 raw를 가리킨다 — 값을
     * 가리키면(원시 항목의 값은 비어 있다) 실체화가 아무것도 저장하지 않고, 컴파일이
     * 없는 실체화 값을 소비해 헤더에서 값이 통째로 사라진다.
     */
    case 'set-cookie':
      return modification.raw ?? modification.value;
    default:
      // header-removal은 값이 없고, redirect는 지원하지 않는다.
      return null;
  }
}

export type ModificationKind = Modification['kind'];

/**
 * 규칙 종류 여덟 가지 — **표시 순서이자 전수 목록**이다.
 *
 * `satisfies`가 union과 맞물려 있어, 종류를 더하고 여기 안 적으면 타입이 먼저 깨진다.
 * 폼의 종류 셀렉트와 "여덟 종류를 빠짐없이 돈다"를 재는 테스트가 같은 목록을 봐야 하므로
 * 타입이 사는 곳에 둔다 — 화면 쪽에 두면 테스트가 UI를 import하게 된다.
 */
export const ALL_MODIFICATION_KINDS = [
  'request-header',
  'response-header',
  'cookie',
  'set-cookie',
  'redirect',
  'user-agent',
  'header-removal',
  'block',
] as const satisfies readonly ModificationKind[];

/**
 * 레거시 프로필 Filter (ADR 0010 이전). 저장·import 마이그레이션의 입력
 * 검증에만 쓰인다 — 새 데이터는 규칙별 RuleConditions로 표현된다.
 */
export type Filter =
  | { kind: 'url'; id: string; enabled: boolean; pattern: string }
  | { kind: 'exclude-url'; id: string; enabled: boolean; pattern: string }
  | { kind: 'resource-type'; id: string; enabled: boolean; resourceTypes: ResourceType[] }
  | { kind: 'request-method'; id: string; enabled: boolean; methods: RequestMethod[] }
  | { kind: 'initiator-domain'; id: string; enabled: boolean; domain: string }
  | { kind: 'tab'; id: string; enabled: boolean; tabId: number }
  | { kind: 'tab-group'; id: string; enabled: boolean; groupId: number }
  | { kind: 'window'; id: string; enabled: boolean; windowId: number }
  | { kind: 'tab-domain'; id: string; enabled: boolean; domain: string }
  | { kind: 'time'; id: string; enabled: boolean; expiresAt: number };

export interface Profile {
  id: string;
  name: string;
  active: boolean;
  /** 배지·UI 식별 색 (#rrggbb). */
  color: string;
  /** 종류를 가로지르는 단일 순서 — 충돌 의미론의 우선순위 세분에 쓰인다. */
  modifications: Modification[];
}

/**
 * 프로필 이름 정규화 (ADR 0017 개정) — 앞뒤 공백을 걷고, 그러고도 비면 **거절한다**.
 *
 * 거절이 `null`인 것이 계약이다. 빈 문자열을 돌려주면 부르는 쪽이 그것을 이름으로 저장할
 * 수 있고, 이름 없는 프로필은 목록에서 짚을 단서가 통째로 없어진다 — 색 스와치는 상태를
 * 나르지 이름을 대신하지 않는다.
 *
 * **중복은 거절하지 않는다.** 이름을 만드는 쪽이 이미 중복을 만든다: `newProfileName`이
 * `profiles.length + 1`로 번호를 붙이므로 셋 중 둘째를 지우면 다음에 만드는 것이 다시
 * "새 프로필 3"이 되고, 가져오기는 남의 파일에 있던 이름을 그대로 들여온다. 중복을 막으면
 * **이미 화면에 있는 그 충돌을 고칠 길이 없어진다** — 허용하는 것이 고칠 수 있게 하는
 * 유일한 선택이고, 그것이 이 규칙의 값이다. 프로필을 가리키는 것은 언제나 `id`이지
 * 이름이 아니다.
 *
 * UI와 명령이 **같은 함수를 부른다.** 화면이 자기 규칙으로 먼저 거르고 명령이 다른 규칙을
 * 쓰면, 메시지로 직접 보낸 이름만 다른 문을 지난다.
 */
export function normalizeProfileName(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 프로필 색 정규화 (ADR 0017 재개정) — **`#rrggbb` 하나로 묶는다.**
 *
 * `#rgb`는 펴고, `#`은 없어도 되고, 대문자는 내린다. 그 밖의 표기는 전부 거절한다 —
 * `rgb()`·`hsl()`·색 이름·알파 8자리 어느 것도 통과하지 못한다.
 *
 * 이렇게 좁게 무는 이유는 **배지**다. `badge.ts`의 `relativeLuminance`가 읽는 것은
 * `#rgb`·`#rrggbb`뿐이고 나머지는 `null`로 떨어뜨리는데, 그러면 배지 글자색의 대비 계산이
 * **조용히** 죽는다 — 사이드바에는 색이 제대로 들어갔는데 툴바 배지만 읽히지 않는 상태가
 * 되고, 그 실패는 색을 고른 사람에게 보이지 않는다. 저장 문턱에서 표기를 하나로 접으면
 * 그 자리가 아예 생기지 않는다.
 *
 * **대비는 재지 않는다.** 어떤 색이든 저장할 수 있고, 배지 글자색은 `badge.ts`가 흰/검
 * 중에서 골라 맞춘다. `PROFILE_COLORS`가 지키던 "이웃 색상각 최소 79°" 보장은 자유 선택에서
 * 사라진다 — 팔레트 밖으로 나가기로 한 결정이 치르는 대가이고, 색이 상태를 나르지 않는다는
 * 계약(스펙 story 38) 덕에 그 대가가 정보 손실이 되지는 않는다.
 */
export function normalizeProfileColor(raw: string): string | null {
  const body = raw.trim().replace(/^#/, '');
  const full = body.length === 3 ? body.replace(/./g, (c) => c + c) : body;
  return /^[0-9a-fA-F]{6}$/.test(full) ? `#${full.toLowerCase()}` : null;
}

/**
 * 업그레이드가 퇴역 조건을 벗기며 남긴 **일회성 공지** (ADR 0017, 티켓 02).
 *
 * 상태에 담는 이유는 컴파일 경고로는 못 하기 때문이다 — 컴파일은 이미 정제된 프로필을
 * 받아 그 시점엔 영향 수가 사라지고 없다. 그리고 **보는 것으로는 지워지지 않는다**:
 * 확인 명령이 쓰기 문을 지나 성공해야 사라진다. 팝업은 렌더 직후 닫히는 것이 정상이라,
 * 그리는 것만으로 소비하면 규칙이 이미 넓어진 뒤에 유일한 설명이 사라진다.
 */
export interface RetirementNotice {
  /** 조건을 잃은 **규칙** 수. 규칙 하나가 여럿을 잃어도 하나로 센다. */
  rules: number;
}

export interface StoredState {
  schemaVersion: typeof SCHEMA_VERSION;
  paused: boolean;
  /**
   * 퇴역 공지 (ADR 0017) — 확인되기 전까지만 있다. 선택 필드인 것이 계약이다: 부재가
   * "알릴 것이 없다"이고, 확인 명령은 값을 0으로 두는 대신 필드를 **지운다**.
   */
  retirementNotice?: RetirementNotice;
  /**
   * 명암 선호 (ADR 0015). 포맷 버전을 올리지 않는 이유: 새 필드는 union을 넓히지 않고
   * **더해질** 뿐이라 예전 상태도 백필로 그대로 읽힌다(customHeaderNames와 같은 계열).
   */
  theme: ThemePreference;
  /**
   * 툴바 배지(적용 규칙 수)를 그릴지 (ADR 0015). theme와 같은 계열의 **더해지는** 선호
   * 필드라 포맷 버전을 올리지 않는다 — 예전 상태는 백필로 그대로 읽힌다.
   *
   * 표시 여부만 정한다. 꺼도 규칙은 그대로 걸리고, 켜면 그때의 적용 수가 다시 보인다.
   */
  badgeVisible: boolean;
  /**
   * 백업 스냅샷을 계정 동기화 저장소(storage.sync)에 둘지 (ADR 0015, R-1).
   *
   * **앞으로의** 저장 위치만 정한다 — 끄거나 켠다고 이미 만들어진 스냅샷이 옮겨지거나
   * 지워지지 않는다. 클라우드 잔재를 지우는 것은 별도의 명시적 동작이다. 이 단순화가
   * 원자적 이관·자동백업과의 경쟁을 구조에서 없앤다.
   */
  syncBackup: boolean;
  /**
   * 화면 언어 선호 (티켓 09). **선택 필드**이고, 부재가 곧 "고른 적 없음 = 브라우저 UI
   * 언어를 따른다"는 뜻이다 — theme의 'system'이 하는 역할을 여기서는 부재가 한다.
   *
   * 필수 필드로 만들고 기본값을 박지 않는 이유: 그리려면 구체적인 언어 하나를 골라야 하고,
   * 그 값이 무엇이든 지금 브라우저 언어를 따르고 있던 사용자 절반의 화면이 이 필드가
   * 생겼다는 이유만으로 뒤집힌다. 우선순위 해석은 i18n의 `pickLocale` 한 곳이 맡는다.
   */
  locale?: Locale;
  profiles: Profile[];
  /**
   * Placeholder 실체화 값의 활성 상태 구역 — Modification id 키.
   * 값 필드(템플릿)를 절대 덮어쓰지 않으며, Export에 포함되지 않는다.
   */
  materialized: Record<string, string>;
  /** 헤더 이름 autocomplete에 더할 사용자 등록 항목. */
  customHeaderNames: string[];
  /**
   * 직접 친 쿠키 이름·User-Agent의 **사용 이력** (티켓 08) — 다음에도 제안된다.
   *
   * `customHeaderNames`와 같은 계열의 **더해지는** 필드라 포맷 버전을 올리지 않는다: 없던
   * 상태는 검증 **전에** 빈 배열을 받으므로 그대로 읽힌다. 그 순서가 계약이다 — 검증이 먼저
   * 보면 없는 필드 하나 때문에 상태 전체가 기본값으로 교체되어 프로필이 사라진다.
   *
   * 헤더 이름과 달리 **저장이 자동으로 남긴다**. 지우는 화면이 따로 없으므로 목록이 무한히
   * 자라지 않도록 상한을 둔다(`commands`의 기록 지점).
   */
  customCookieNames: string[];
  customUserAgents: string[];
}

/** 배지는 기본으로 켜져 있다 — 끄지 않은 사용자는 지금까지처럼 본다. */
export const DEFAULT_BADGE_VISIBLE = true;

/**
 * 백업은 기본으로 클라우드(storage.sync)에 간다 — 지금까지 백업이 항상 sync였으므로,
 * 기존 설치는 이 기본값으로 자기 히스토리를 그대로 본다.
 */
export const DEFAULT_SYNC_BACKUP = true;

/**
 * 새 프로필에 차례로 붙는 색 열 가지 — 목록 스와치와 툴바 배지가 이 값을 그대로 쓴다.
 *
 * **순서는 색상환 순이 아니라 이웃끼리 가장 먼 순이다.** 새 프로필은 `길이 % 10`으로 다음
 * 색을 받으므로(app 셸), 색상환대로 늘어놓으면 연달아 만든 두 프로필이 이웃 색을 받아
 * 목록에서 구별되지 않는다. 여기 배열은 인접한 두 항목의 색상각이 최소 79° 벌어지게 섞어
 * 둔 것이다 — 열한 번째에 첫 색으로 돌아갈 때만 48°로 가까워진다.
 *
 * 첫 항목은 그대로 이 앱의 accent 파랑이다. `createProfile`의 기본값이자 기본 프로필의
 * 색이라(persist의 복구 경로도 이것을 쓴다) 자리를 옮기면 기존 화면의 첫 색이 달라진다.
 *
 * 색은 만들 때 정해져 이후 바뀌지 않으므로(ADR 0017) 이 목록을 고쳐도 **이미 만든 프로필은
 * 그대로다** — 늘어난 가짓수는 앞으로 만드는 것에만 닿는다.
 */
export const PROFILE_COLORS = [
  '#2563eb', // blue
  '#d97706', // amber
  '#16a34a', // green
  '#9333ea', // purple
  '#0891b2', // cyan
  '#dc2626', // red
  '#4f46e5', // indigo
  '#65a30d', // lime
  '#db2777', // pink
  '#0d9488', // teal
] as const;

export function createProfile(name: string, options: { id?: string; color?: string } = {}): Profile {
  return {
    id: options.id ?? crypto.randomUUID(),
    name,
    active: false,
    color: options.color ?? PROFILE_COLORS[0],
    modifications: [],
  };
}

export function createHeaderModification(
  kind: 'request-header' | 'response-header',
  id: string = crypto.randomUUID(),
): Modification {
  return {
    kind,
    id,
    name: '',
    value: '',
    mode: 'override',
    emptyMeans: 'remove',
    comment: '',
    enabled: true,
  };
}

export function createModification(kind: ModificationKind, id: string = crypto.randomUUID()): Modification {
  const common = { id, comment: '', enabled: true };
  switch (kind) {
    case 'request-header':
    case 'response-header':
      return { kind, ...common, name: '', value: '', mode: 'override', emptyMeans: 'remove' };
    case 'cookie':
      return { kind, ...common, name: '', value: '', mode: 'append', emptyMeans: 'remove' };
    case 'set-cookie':
      return { kind, ...common, name: '', value: '', mode: 'append', emptyMeans: 'remove' };
    case 'redirect':
      return { kind, ...common, pattern: '', substitution: '' };
    case 'user-agent':
      // 헤더 이름은 고정이라 값만 받는다.
      return { kind, ...common, value: '' };
    case 'header-removal':
      // 지울 이름만 받는다 — 값·mode가 없다(양쪽에서 제거하는 것이 전부).
      return { kind, ...common, name: '' };
    case 'block':
      // 이름도 값도 없다 — 무엇을 막을지는 URL 스코프와 Condition만이 정한다.
      return { kind, ...common };
    default:
      return kind satisfies never;
  }
}

/** 기존 호출부 호환용 — Request Header 생성 단축. */
export function createRequestHeaderModification(id: string = crypto.randomUUID()): RequestHeaderModification {
  return createHeaderModification('request-header', id) as RequestHeaderModification;
}

export function createDefaultState(): StoredState {
  return {
    schemaVersion: SCHEMA_VERSION,
    paused: false,
    theme: DEFAULT_THEME,
    badgeVisible: DEFAULT_BADGE_VISIBLE,
    syncBackup: DEFAULT_SYNC_BACKUP,
    profiles: [{ ...createProfile('Default Profile'), active: true }],
    materialized: {},
    customHeaderNames: [],
    customCookieNames: [],
    customUserAgents: [],
  };
}
