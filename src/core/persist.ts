import { ALL_RESOURCE_TYPES, REQUEST_METHODS, type RequestMethod, type ResourceType } from './rules';
import {
  createDefaultState,
  PROFILE_COLORS,
  SCHEMA_VERSION,
  type Filter,
  type Modification,
  type Profile,
  type StoredState,
} from './model';

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === 'string');
}

/** 규칙 조건(ADR 0010) 형 검증 — 선택 객체, 각 필드도 선택. */
function isRuleConditions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    (value.excludedDomains === undefined || isStringArray(value.excludedDomains)) &&
    (value.resourceTypes === undefined ||
      (Array.isArray(value.resourceTypes) && value.resourceTypes.every(isResourceType))) &&
    (value.requestMethods === undefined ||
      (Array.isArray(value.requestMethods) && value.requestMethods.every(isRequestMethod))) &&
    (value.initiatorDomains === undefined || isStringArray(value.initiatorDomains)) &&
    (value.tabDomains === undefined || isStringArray(value.tabDomains)) &&
    (value.expiresAt === undefined || typeof value.expiresAt === 'number')
  );
}

export function isModification(value: unknown): value is Modification {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.comment !== 'string' ||
    typeof value.enabled !== 'boolean' ||
    // 규칙 자체 URL 필터(ADR 0007)는 선택 문자열 — redirect에는 없다.
    (value.urlFilter !== undefined && (typeof value.urlFilter !== 'string' || value.kind === 'redirect')) ||
    // 매치 방식(ADR 0008)은 enum — backfill이 무효값을 치유한 뒤라 여기선 형만 지킨다.
    (value.urlMatchType !== undefined &&
      !['domain', 'contains', 'prefix', 'regex'].includes(value.urlMatchType as string)) ||
    !isRuleConditions(value.conditions)
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
    value.modifications.every(isModification)
  );
}

/** Modification에 이후 슬라이스에서 추가된 필드를 기본값으로 채운다 (SSOT 보호). */
export function backfillModification(value: unknown): unknown {
  if (!isRecord(value)) return value;
  // csp/redirect는 mode/emptyMeans가 없다 — 헤더 계열(및 cookie/set-cookie)만 채운다.
  if (value.kind === 'redirect') {
    // redirect의 urlFilter(ADR 0007 비대상)는 치유로 제거 — 검증 거부가 전체
    // 상태를 기본값으로 리셋하는 것보다 필드 하나를 벗기는 쪽이 안전하다.
    const { urlFilter: _stripped, ...rest } = value;
    return { comment: '', ...rest };
  }
  if (value.kind === 'csp') {
    return { comment: '', ...value };
  }
  // 무효 urlMatchType은 치유로 벗긴다(부재 = regex 하위 호환) — 전량 거부 방지.
  const healed: Record<string, unknown> = { mode: 'override', emptyMeans: 'remove', comment: '', ...value };
  if (
    healed.urlMatchType !== undefined &&
    !['domain', 'contains', 'prefix', 'regex'].includes(healed.urlMatchType as string)
  ) {
    delete healed.urlMatchType;
  }
  return healed;
}

/**
 * v1 내부 반복 중 추가된 선택 필드를 기본값으로 채운다.
 * 필드 추가가 기존 저장 상태를 전량 거부로 파괴하면 안 된다 (SSOT 보호).
 */
function backfillProfile(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const base = {
    shortLabel: typeof value.name === 'string' ? value.name.charAt(0).toUpperCase() : '',
    color: PROFILE_COLORS[0],
    ...value,
    modifications: Array.isArray(value.modifications)
      ? value.modifications.map(backfillModification)
      : value.modifications,
  };
  return migrateProfileFilters(base);
}

/**
 * 프로필 수준 필터 → 규칙 conditions 마이그레이션 (ADR 0010, 의미론 보존).
 * URL 조인(OR)은 자체 스코프 없는 규칙의 regex 스코프로, 리소스/메서드/initiator/
 * 탭 도메인은 conditions 배열로, 시간은 최솟값으로 복사한다. 제외 URL과
 * 탭/그룹/창 피커는 규칙 단위 대응물이 없어 소실된다(ADR 명시).
 */
export function migrateProfileFilters(value: Record<string, unknown>): Record<string, unknown> {
  const filters = value.filters;
  if (!Array.isArray(filters)) return value;
  const { filters: _dropped, ...profile } = value;
  if (!Array.isArray(profile.modifications)) return profile;

  const enabled = filters.filter(
    (f): f is Record<string, unknown> => isRecord(f) && f.enabled === true,
  );
  const byKind = (kind: string) => enabled.filter((f) => f.kind === kind);

  const urlJoin = byKind('url')
    .map((f) => (typeof f.pattern === 'string' ? f.pattern.trim() : ''))
    .filter((x) => x !== '')
    .map((x) => `(?:${x})`)
    .join('|');
  const strings = (kind: string, field: string) =>
    byKind(kind)
      .map((f) => (typeof f[field] === 'string' ? (f[field] as string).trim() : ''))
      .filter((x) => x !== '');
  const resourceTypes = [...new Set(byKind('resource-type').flatMap((f) =>
    Array.isArray(f.resourceTypes) ? f.resourceTypes : []))];
  const requestMethods = [...new Set(byKind('request-method').flatMap((f) =>
    Array.isArray(f.methods) ? f.methods : []))];
  const initiatorDomains = [...new Set(strings('initiator-domain', 'domain'))];
  const tabDomains = [...new Set(strings('tab-domain', 'domain'))];
  const expiries = byKind('time')
    .map((f) => f.expiresAt)
    .filter((x): x is number => typeof x === 'number');
  const expiresAt = expiries.length > 0 ? Math.min(...expiries) : undefined;

  const conditions: Record<string, unknown> = {};
  if (resourceTypes.length > 0) conditions.resourceTypes = resourceTypes;
  if (requestMethods.length > 0) conditions.requestMethods = requestMethods;
  if (initiatorDomains.length > 0) conditions.initiatorDomains = initiatorDomains;
  if (tabDomains.length > 0) conditions.tabDomains = tabDomains;
  if (expiresAt !== undefined) conditions.expiresAt = expiresAt;
  const hasConditions = Object.keys(conditions).length > 0;
  if (urlJoin === '' && !hasConditions) return profile;

  return {
    ...profile,
    modifications: profile.modifications.map((m) => {
      if (!isRecord(m)) return m;
      const next: Record<string, unknown> = { ...m };
      // URL 조인은 자체 스코프가 없는 비-redirect 규칙에만 (0007: 자체가 우선)
      if (
        urlJoin !== '' &&
        m.kind !== 'redirect' &&
        (typeof m.urlFilter !== 'string' || m.urlFilter.trim() === '')
      ) {
        next.urlFilter = urlJoin;
        next.urlMatchType = 'regex';
      }
      if (hasConditions) {
        next.conditions = { ...conditions, ...(isRecord(m.conditions) ? m.conditions : {}) };
      }
      return next;
    }),
  };
}

function isMaterializedRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

/**
 * 저장소에서 읽은 알 수 없는 값을 StoredState로 검증한다.
 * 스키마 위반은 전량 거부하고 기본 상태로 대체한다 — 반쯤 깨진 상태로
 * 규칙을 컴파일하지 않는다. 이후 슬라이스가 variant 검증을 여기에 확장한다.
 */
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
