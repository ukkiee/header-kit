import type { RequestMethod, ResourceType } from './rules';

export const SCHEMA_VERSION = 1 as const;

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

export interface CspDirective {
  name: string;
  value: string;
}

/** CSP — 디렉티브를 합성해 Content-Security-Policy 응답 헤더로 set 한다. */
export interface CspModification {
  kind: 'csp';
  id: string;
  directives: CspDirective[];
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

export type Modification =
  | RequestHeaderModification
  | ResponseHeaderModification
  | CookieModification
  | SetCookieModification
  | CspModification
  | RedirectModification;

/**
 * Placeholder 실체화 대상이 되는 값 문자열 (없으면 null).
 * 값이 있는 종류(header/cookie/set-cookie)만 Placeholder를 지원한다 —
 * csp/redirect는 지원하지 않는다.
 */
export function placeholderTemplate(modification: Modification): string | null {
  switch (modification.kind) {
    case 'request-header':
    case 'response-header':
    case 'cookie':
    case 'set-cookie':
      return modification.value;
    default:
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
  profiles: Profile[];
  /**
   * Placeholder 실체화 값의 활성 상태 구역 — Modification id 키.
   * 값 필드(템플릿)를 절대 덮어쓰지 않으며, Export에 포함되지 않는다.
   */
  materialized: Record<string, string>;
  /** 헤더 이름 autocomplete에 더할 사용자 등록 항목. */
  customHeaderNames: string[];
}

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
    case 'csp':
      return { kind, ...common, directives: [] };
    case 'redirect':
      return { kind, ...common, pattern: '', substitution: '' };
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
    profiles: [{ ...createProfile('Default Profile'), active: true }],
    materialized: {},
    customHeaderNames: [],
  };
}
