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
      !['domain', 'contains', 'prefix', 'regex'].includes(value.urlMatchType as string))
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
  return {
    shortLabel: typeof value.name === 'string' ? value.name.charAt(0).toUpperCase() : '',
    color: PROFILE_COLORS[0],
    filters: [],
    ...value,
    modifications: Array.isArray(value.modifications)
      ? value.modifications.map(backfillModification)
      : value.modifications,
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
