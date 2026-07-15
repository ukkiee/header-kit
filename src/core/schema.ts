import { ALL_RESOURCE_TYPES, REQUEST_METHODS, type RequestMethod, type ResourceType } from './rules';

export const SCHEMA_VERSION = 1 as const;

/**
 * Modification은 종류를 판별자(kind)로 갖는 discriminated union이다.
 * 후속 슬라이스는 이 union에 variant를 추가할 뿐, Profile의 공개 계약
 * (ordered modifications 컬렉션)은 바뀌지 않는다.
 */
/** 기존 값을 통째 대체(override)하거나 뒤에 덧붙인다(append). */
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
}

/** Redirect — regex 매칭 + 캡처 그룹 치환으로 URL을 재작성한다. */
export interface RedirectModification {
  kind: 'redirect';
  id: string;
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
 * Filter도 kind 판별 union이다. 같은 kind끼리 OR, 다른 kind끼리 AND로
 * 합성된다 (PRD Filter 의미론). Tab 계열·Time Filter는 이슈 06에서 추가된다.
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

export type FilterKind = Filter['kind'];

/** 탭·그룹·창 Filter의 "아직 선택되지 않음" 값 — 컴파일에서 무시된다. */
export const UNSET_ID = -1;

export function createFilter(kind: FilterKind, id: string = crypto.randomUUID()): Filter {
  switch (kind) {
    case 'url':
    case 'exclude-url':
      return { kind, id, enabled: true, pattern: '' };
    case 'resource-type':
      return { kind, id, enabled: true, resourceTypes: [] };
    case 'request-method':
      return { kind, id, enabled: true, methods: [] };
    case 'initiator-domain':
    case 'tab-domain':
      return { kind, id, enabled: true, domain: '' };
    case 'tab':
      return { kind, id, enabled: true, tabId: UNSET_ID };
    case 'tab-group':
      return { kind, id, enabled: true, groupId: UNSET_ID };
    case 'window':
      return { kind, id, enabled: true, windowId: UNSET_ID };
    case 'time':
      return { kind, id, enabled: true, expiresAt: 0 };
    default:
      return kind satisfies never;
  }
}

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
  /** 이 Profile의 Modification이 적용될 요청 범위를 좁히는 조건들. */
  filters: Filter[];
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
    filters: [],
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHeaderish(value: Record<string, unknown>): boolean {
  return (
    typeof value.value === 'string' &&
    (value.mode === 'override' || value.mode === 'append') &&
    (value.emptyMeans === 'remove' || value.emptyMeans === 'send-empty')
  );
}

export function isModification(value: unknown): value is Modification {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.comment !== 'string' ||
    typeof value.enabled !== 'boolean'
  ) {
    return false;
  }
  switch (value.kind) {
    case 'request-header':
    case 'response-header':
      return typeof value.name === 'string' && isHeaderish(value);
    case 'cookie':
      return typeof value.name === 'string' && isHeaderish(value);
    case 'set-cookie':
      return isHeaderish(value);
    case 'csp':
      return (
        Array.isArray(value.directives) &&
        value.directives.every(
          (d) => isRecord(d) && typeof d.name === 'string' && typeof d.value === 'string',
        )
      );
    case 'redirect':
      return typeof value.pattern === 'string' && typeof value.substitution === 'string';
    default:
      return false;
  }
}

function isResourceType(value: unknown): value is ResourceType {
  return typeof value === 'string' && (ALL_RESOURCE_TYPES as readonly string[]).includes(value);
}

function isRequestMethod(value: unknown): value is RequestMethod {
  return typeof value === 'string' && (REQUEST_METHODS as readonly string[]).includes(value);
}

export function isFilter(value: unknown): value is Filter {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.enabled !== 'boolean') {
    return false;
  }
  switch (value.kind) {
    case 'url':
    case 'exclude-url':
      return typeof value.pattern === 'string';
    case 'resource-type':
      return Array.isArray(value.resourceTypes) && value.resourceTypes.every(isResourceType);
    case 'request-method':
      return Array.isArray(value.methods) && value.methods.every(isRequestMethod);
    case 'initiator-domain':
    case 'tab-domain':
      return typeof value.domain === 'string';
    case 'tab':
      return typeof value.tabId === 'number';
    case 'tab-group':
      return typeof value.groupId === 'number';
    case 'window':
      return typeof value.windowId === 'number';
    case 'time':
      return typeof value.expiresAt === 'number';
    default:
      return false;
  }
}

function isProfile(value: unknown): value is Profile {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.active === 'boolean' &&
    typeof value.shortLabel === 'string' &&
    typeof value.color === 'string' &&
    Array.isArray(value.modifications) &&
    value.modifications.every(isModification) &&
    Array.isArray(value.filters) &&
    value.filters.every(isFilter)
  );
}

/** Modification에 이후 슬라이스에서 추가된 필드를 기본값으로 채운다 (SSOT 보호). */
export function backfillModification(value: unknown): unknown {
  if (!isRecord(value)) return value;
  // csp/redirect는 mode/emptyMeans가 없다 — 헤더 계열(및 cookie/set-cookie)만 채운다.
  if (value.kind === 'csp' || value.kind === 'redirect') {
    return { comment: '', ...value };
  }
  return { mode: 'override', emptyMeans: 'remove', comment: '', ...value };
}

/**
 * v1 내부 반복 중 추가된 선택 필드를 기본값으로 채운다.
 * 필드 추가가 기존 저장 상태를 전량 거부로 파괴하면 안 된다 (SSOT 보호).
 */
function backfillProfile(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    shortLabel:
      typeof value.name === 'string' ? value.name.charAt(0).toUpperCase() : '',
    color: PROFILE_COLORS[0],
    filters: [],
    ...value,
    modifications: Array.isArray(value.modifications)
      ? value.modifications.map(backfillModification)
      : value.modifications,
  };
}

/**
 * 저장소에서 읽은 알 수 없는 값을 StoredState로 검증한다.
 * 스키마 위반은 전량 거부하고 기본 상태로 대체한다 — 반쯤 깨진 상태로
 * 규칙을 컴파일하지 않는다. 이후 슬라이스가 variant 검증을 여기에 확장한다.
 */
function isMaterializedRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')
  );
}

export function parseStoredState(value: unknown): StoredState {
  if (
    isRecord(value) &&
    value.schemaVersion === SCHEMA_VERSION &&
    typeof value.paused === 'boolean' &&
    Array.isArray(value.profiles)
  ) {
    const profiles = value.profiles.map(backfillProfile);
    const materialized = value.materialized ?? {};
    const customHeaderNames = Array.isArray(value.customHeaderNames)
      ? value.customHeaderNames.filter((n): n is string => typeof n === 'string')
      : [];
    if (profiles.every(isProfile) && isMaterializedRecord(materialized)) {
      return { ...value, profiles, materialized, customHeaderNames } as unknown as StoredState;
    }
  }
  return createDefaultState();
}
