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
 */
export interface RuleConditions {
  /** 이 도메인들(서브도메인 포함)의 요청에는 적용하지 않는다. */
  excludedDomains?: string[];
  resourceTypes?: ResourceType[];
  requestMethods?: RequestMethod[];
  /** 요청 출처(origin) 도메인 매칭. */
  initiatorDomains?: string[];
  /** 이 도메인 탭에서 나가는 요청에만 적용 (탭 전개 → tabIds). */
  tabDomains?: string[];
  /** 자동 해제 시각(epoch ms) — 만료 알람이 이 규칙만 끈다. */
  expiresAt?: number;
}

/** 조건 객체 정리 — 빈 필드는 벗기고, 전부 비면 undefined. */
export function normalizeConditions(conditions: RuleConditions): RuleConditions | undefined {
  const next: RuleConditions = {};
  if (conditions.excludedDomains?.length) next.excludedDomains = conditions.excludedDomains;
  if (conditions.resourceTypes?.length) next.resourceTypes = conditions.resourceTypes;
  if (conditions.requestMethods?.length) next.requestMethods = conditions.requestMethods;
  if (conditions.initiatorDomains?.length) next.initiatorDomains = conditions.initiatorDomains;
  if (conditions.tabDomains?.length) next.tabDomains = conditions.tabDomains;
  if (conditions.expiresAt !== undefined) next.expiresAt = conditions.expiresAt;
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

/**
 * Set-Cookie — Set-Cookie 응답 헤더를 수정한다 (ADR-0001).
 * append: 새 Set-Cookie 추가. override: 통째 교체. 빈 값 + remove: 차단(제거).
 */
export interface SetCookieModification {
  kind: 'set-cookie';
  id: string;
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
    case 'set-cookie':
    // User-Agent도 값을 가진 종류다 — {{uuid}} 같은 토큰을 UA 문자열에 넣을 수 있다.
    case 'user-agent':
      return modification.value;
    default:
      // header-removal은 값이 없고, redirect는 지원하지 않는다.
      return null;
  }
}

export type ModificationKind = Modification['kind'];

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
  /** 툴바 배지에 표시되는 1–2자 라벨. */
  shortLabel: string;
  /** 배지·UI 식별 색 (#rrggbb). */
  color: string;
  /** 종류를 가로지르는 단일 순서 — 충돌 의미론의 우선순위 세분에 쓰인다. */
  modifications: Modification[];
}

export interface StoredState {
  schemaVersion: typeof SCHEMA_VERSION;
  paused: boolean;
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
  profiles: Profile[];
  /**
   * Placeholder 실체화 값의 활성 상태 구역 — Modification id 키.
   * 값 필드(템플릿)를 절대 덮어쓰지 않으며, Export에 포함되지 않는다.
   */
  materialized: Record<string, string>;
  /** 헤더 이름 autocomplete에 더할 사용자 등록 항목. */
  customHeaderNames: string[];
}

/** 배지는 기본으로 켜져 있다 — 끄지 않은 사용자는 지금까지처럼 본다. */
export const DEFAULT_BADGE_VISIBLE = true;

export const PROFILE_COLORS = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#9333ea',
  '#0891b2',
] as const;

export function createProfile(
  name: string,
  options: { id?: string; color?: string; shortLabel?: string } = {},
): Profile {
  return {
    id: options.id ?? crypto.randomUUID(),
    name,
    active: false,
    shortLabel: options.shortLabel ?? name.charAt(0).toUpperCase(),
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
      return { kind, ...common, value: '', mode: 'append', emptyMeans: 'remove' };
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
export function createRequestHeaderModification(
  id: string = crypto.randomUUID(),
): RequestHeaderModification {
  return createHeaderModification('request-header', id) as RequestHeaderModification;
}

export function createDefaultState(): StoredState {
  return {
    schemaVersion: SCHEMA_VERSION,
    paused: false,
    theme: DEFAULT_THEME,
    badgeVisible: DEFAULT_BADGE_VISIBLE,
    profiles: [{ ...createProfile('Default Profile'), active: true }],
    materialized: {},
    customHeaderNames: [],
  };
}
