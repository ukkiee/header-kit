import { isLocale } from './i18n';
import {
  ALL_RESOURCE_TYPES,
  REQUEST_METHODS,
  RETIRED_REQUEST_METHODS,
  type RequestMethod,
  type ResourceType,
} from './rules';
import { DEFAULT_THEME, isThemePreference } from './theme';
import { hasPlaceholders } from './placeholder';
import {
  assembleSetCookie,
  createDefaultState,
  DEFAULT_BADGE_VISIBLE,
  DEFAULT_SYNC_BACKUP,
  SAME_SITE_LABEL,
  PROFILE_COLORS,
  SCHEMA_VERSION,
  type Filter,
  type Modification,
  type RetirementNotice,
  type SameSitePolicy,
  type SetCookieParts,
  type Profile,
  type StoredState,
} from './model';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 적용 방식과 빈 값의 뜻 — 값을 가진 종류가 공통으로 갖는 두 필드. */
function hasHeaderMode(value: Record<string, unknown>): boolean {
  return (
    (value.mode === 'override' || value.mode === 'append') &&
    (value.emptyMeans === 'remove' || value.emptyMeans === 'send-empty')
  );
}

function isHeaderish(value: Record<string, unknown>): boolean {
  return typeof value.value === 'string' && hasHeaderMode(value);
}

/** 구조화 재료의 필드들 — 원시 변형은 이 중 **하나도** 가져서는 안 된다. */
const SET_COOKIE_PART_KEYS = [
  'name',
  'value',
  'domain',
  'path',
  'maxAge',
  'sameSite',
  'secure',
  'httpOnly',
] as const;

/**
 * 응답 쿠키는 두 표현 중 **정확히 하나**만 갖는다 (ADR 0017, structure r1 S-2).
 *
 * 타입으로 못박은 것을 저장소 문에서도 지킨다 — 타입만으로는 밖에서 들어온 JSON을 막지
 * 못하고, 둘을 함께 든 레코드가 통과하면 폼이 재료를 고쳐 저장한 뒤에도 컴파일이 우선하는
 * 원시 줄이 계속 나간다.
 */
function isSetCookieVariant(value: Record<string, unknown>): boolean {
  if (!hasHeaderMode(value)) return false;
  if (value.raw !== undefined) {
    return (
      typeof value.raw === 'string' &&
      SET_COOKIE_PART_KEYS.every((key) => value[key] === undefined)
    );
  }
  return typeof value.name === 'string' && isHeaderish(value) && isSetCookieShape(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === 'string');
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

/** 허용 집합은 라벨 맵이 소유한다 — 값을 늘려도 여기가 따라오지 않는 일이 없다. */
function isSameSitePolicy(value: unknown): value is SameSitePolicy {
  return typeof value === 'string' && value in SAME_SITE_LABEL;
}

/** v3 응답 쿠키의 선택 필드 형 검증 (ADR 0017) — 이름·값은 호출부가 따로 본다. */
function isSetCookieShape(value: Record<string, unknown>): boolean {
  return (
    isOptionalString(value.domain) &&
    isOptionalString(value.path) &&
    isOptionalString(value.maxAge) &&
    (value.sameSite === undefined || isSameSitePolicy(value.sameSite)) &&
    (value.secure === undefined || typeof value.secure === 'boolean') &&
    (value.httpOnly === undefined || typeof value.httpOnly === 'boolean')
  );
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
      return isSetCookieVariant(value);
    case 'redirect':
      return typeof value.pattern === 'string' && typeof value.substitution === 'string';
    case 'user-agent':
      // 값만 갖는다 — 헤더 이름은 고정이라 저장하지 않는다.
      return typeof value.value === 'string';
    case 'header-removal':
      // 이름만 갖는다 — 값·mode가 없다.
      return typeof value.name === 'string';
    case 'block':
      // 고유 필드가 없다 — URL 스코프·조건은 위 공통 검증이 이미 봤다.
      return true;
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
    typeof value.color === 'string' &&
    Array.isArray(value.modifications) &&
    value.modifications.every(isModification)
  );
}

/** Modification에 이후 슬라이스에서 추가된 필드를 기본값으로 채운다 (SSOT 보호). */
export function backfillModification(value: unknown): unknown {
  if (!isRecord(value)) return value;
  // redirect는 mode/emptyMeans가 없다 — 헤더 계열(및 cookie/set-cookie)만 채운다.
  if (value.kind === 'redirect') {
    // redirect의 urlFilter(ADR 0007 비대상)는 치유로 제거 — 검증 거부가 전체
    // 상태를 기본값으로 리셋하는 것보다 필드 하나를 벗기는 쪽이 안전하다.
    const { urlFilter: _stripped, ...rest } = value;
    return { comment: '', ...rest };
  }
  /*
   * mode·emptyMeans는 **값을 가진 헤더 계열에만** 의미가 있다. user-agent(값만)·
   * header-removal(이름만)·block(둘 다 없음)에 붙이면 저장소에 뜻 없는 필드가 쌓이고,
   * 나중에 그 필드를 읽는 코드가 생기면 조용히 잘못된 분기를 탄다.
   */
  const headerish =
    value.kind !== 'user-agent' && value.kind !== 'header-removal' && value.kind !== 'block';
  // 무효 urlMatchType은 치유로 벗긴다(부재 = regex 하위 호환) — 전량 거부 방지.
  const healed: Record<string, unknown> = {
    ...(headerish ? { mode: 'override', emptyMeans: 'remove' } : {}),
    comment: '',
    ...value,
  };
  if (
    healed.urlMatchType !== undefined &&
    !['domain', 'contains', 'prefix', 'regex'].includes(healed.urlMatchType as string)
  ) {
    delete healed.urlMatchType;
  }
  return healed;
}

/**
 * 옛 원시 Set-Cookie 한 줄을 재료로 가른다 — **모호하면 null**이고, 그때 호출부는
 * 그 줄을 원시 그대로 보존한다 (ADR 0017).
 *
 * 판정의 마지막 단계가 이 함수의 요점이다: 갈라낸 재료를 다시 조립해 **원본과 글자까지
 * 같을 때만** 받는다. 그래서 구분자 간격이나 속성 순서 같은 것을 따로 규칙으로 적을 필요가
 * 없고, "업그레이드해도 같은 쿠키가 나간다"가 문서가 아니라 구조로 성립한다. 잘못 갈라
 * 다른 쿠키를 내보내는 것이 원시로 남기는 것보다 나쁘다.
 */
export function parseSetCookieLine(line: string): SetCookieParts | null {
  const parts = splitSetCookieLine(line);
  return parts && assembleSetCookie(parts) === line ? parts : null;
}

function splitSetCookieLine(line: string): SetCookieParts | null {
  // 빈 줄은 v2에서 "헤더를 지운다"는 뜻이었다 — 재료로 가를 것이 없다.
  // 플레이스홀더가 든 줄은 실체화 자리가 달라지므로 가르지 않는다.
  if (line === '' || hasPlaceholders(line)) return null;

  const [head, ...attributes] = line.split('; ');
  if (head === undefined) return null;
  const separator = head.indexOf('=');
  if (separator <= 0) return null; // name=value 꼴이 아니거나 이름이 비었다
  /*
   * 공백뿐인 이름은 받지 않는다 (structure r1 S-1). 왕복은 성립하지만 컴파일이 이름을
   * trim해 "빈 쿠키"로 접으므로, 받아들이면 `emptyMeans: 'remove'` 아래에서 헤더가
   * **제거**된다 — 원본 바이트를 그대로 내보낸다는 이 변환의 약속이 거기서 깨진다.
   */
  if (head.slice(0, separator).trim() === '') return null;
  const value = head.slice(separator + 1);
  if (value.includes('=')) return null; // 값 안의 = 는 모호함으로 본다

  const parts: SetCookieParts = { name: head.slice(0, separator), value };
  const seen = new Set<string>();
  for (const attribute of attributes) {
    const at = attribute.indexOf('=');
    const key = (at < 0 ? attribute : attribute.slice(0, at)).toLowerCase();
    const raw = at < 0 ? undefined : attribute.slice(at + 1);
    if (seen.has(key)) return null; // 같은 속성이 두 번
    seen.add(key);
    switch (key) {
      case 'domain':
        if (!raw) return null;
        parts.domain = raw;
        break;
      case 'path':
        if (!raw) return null;
        parts.path = raw;
        break;
      case 'max-age':
        if (raw === undefined || !/^-?\d+$/.test(raw)) return null;
        parts.maxAge = raw;
        break;
      case 'samesite': {
        const policy = raw?.toLowerCase();
        if (!isSameSitePolicy(policy)) return null;
        parts.sameSite = policy;
        break;
      }
      case 'secure':
        if (raw !== undefined) return null;
        parts.secure = true;
        break;
      case 'httponly':
        if (raw !== undefined) return null;
        parts.httpOnly = true;
        break;
      // 모르는 속성 — Expires도 여기로 온다. 지원하지 않는 것을 버리고 되쓰면 다른 쿠키가 나간다.
      default:
        return null;
    }
  }
  return parts;
}

/**
 * 퇴역한 **종류**의 수정을 걷어낸다 (csp — ADR 0013). 사용자가 지운 항목이나
 * enabled:false와 무관하다. 로드·import 두 진입점 모두 **검증보다 먼저** 불러야
 * 한다 — 검증이 먼저 보면 csp는 무효 수정이라, 로드는 상태 전체를 기본값으로
 * 리셋하고 import는 파일을 통째로 거부한다. 버리되 같은 프로필의 나머지 수정·
 * 메타는 그대로 둔다.
 */
export function dropRetiredKinds(modifications: unknown[]): unknown[] {
  return modifications.filter((m) => !(isRecord(m) && m.kind === 'csp'));
}

/**
 * 퇴역한 **프로필 필드**를 걷어낸다 (ADR 0017, 티켓 04) — 지금은 두 글자 라벨 하나다.
 *
 * 읽기 경로와 가져오기 경로가 **각각** 부른다. 하나로 합치지 못하는 이유는 두 문이 실제로
 * 다르기 때문이다: 이미 현재 버전인 상태는 업그레이드를 아예 지나지 않고 검증만 받는다
 * (`readStoredState`의 같은 버전 분기) — 거기에만 두면 지금 설치된 거의 모든 상태가 이 필드를
 * 영원히 들고 다닌다. 반대로 검증 쪽에만 두면 가져오기가 그것을 그대로 실어 온다.
 *
 * 걷어도 공지는 뜨지 않는다. 이 필드는 어디에서도 렌더되지 않던 죽은 값이라 사라져도 걸리는
 * 규칙이 하나도 달라지지 않는다 — 공지는 규칙이 전보다 **넓게** 걸리게 됐을 때의 것이다(티켓 02).
 */
export function dropRetiredProfileFields<T>(profile: T): T {
  if (!isRecord(profile)) return profile;
  const { shortLabel: _retiredLabel, ...rest } = profile;
  return rest as T;
}

/**
 * v1 내부 반복 중 추가된 선택 필드를 기본값으로 채운다.
 * 필드 추가가 기존 저장 상태를 전량 거부로 파괴하면 안 된다 (SSOT 보호).
 */
function backfillProfile(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const base = {
    color: PROFILE_COLORS[0],
    ...dropRetiredProfileFields(value),
    // 퇴역 종류는 isProfile 검증에 닿기 전에 버린다 — 닿으면 전체 리셋이다.
    modifications: Array.isArray(value.modifications)
      ? dropRetiredKinds(value.modifications).map(backfillModification)
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
 * 저장된 값을 읽은 결과. 상태를 돌려주는 분기와 **돌려주지 않는** 분기를 타입으로 가른다.
 *
 * `blocked`가 state를 들고 있지 않은 것이 이 타입의 요점이다(티켓 02, ADR 0015). 예전
 * 리더는 버전이 어긋나면 무엇이든 기본 상태로 대체했고, 호출부는 그것을 정상 상태와
 * 구분할 수 없어 다음 저장에서 원본을 덮어썼다 — 구버전으로 되돌아가면 프로필이 통째로
 * 사라지는 경로다. 돌려줄 state가 아예 없으면 그 실수를 저지를 수 없다.
 */
export type StoredStateRead =
  /** 현재 버전 — 그대로 쓴다. */
  | { status: 'ok'; state: StoredState }
  /** 구버전에서 올렸다 — 데이터는 보존됐고, 다음 저장 때 v2로 굳는다. */
  | { status: 'migrated'; from: number; state: StoredState }
  /** 읽을 수 없고 **덮어써서도 안 된다**. 사용자 데이터가 그대로 남아 복구 기회가 있다. */
  | { status: 'blocked'; reason: 'newer' | 'unmigratable'; storedVersion: number }
  /** 저장된 것이 없거나 우리 모양이 전혀 아니다 — 신규 설치처럼 시작한다. */
  | { status: 'reset'; state: StoredState };

/**
 * v1 → v2 마이그레이션 (ADR 0015).
 *
 * v2가 더한 것은 Modification 종류(User-Agent·Header Removal — Block은 아직 미구현)뿐이고, 그것은
 * union에 **더해질** 뿐 기존 항목의 형태를 바꾸지 않는다. 그래서 이 마이그레이션은 값을
 * 손대지 않고 버전만 올린다 — 백필·검증은 아래 공통 경로가 그대로 맡는다.
 *
 * **찍는 숫자는 리터럴 2다.** 예전에는 `SCHEMA_VERSION`을 찍었는데, 그러면 상수가 3으로
 * 오르는 것만으로 v1 데이터가 v2→v3 변환을 한 번도 지나지 않은 채 "v3"로 라벨링된다 —
 * v1 사용자의 원시 Set-Cookie가 새 뜻으로 읽혀 v3 경계가 막으려던 그 실패가 되살아난다.
 * 각 단계는 자기 목적지만 안다.
 */
function migrateStoredStateV1ToV2(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value, schemaVersion: 2 };
}

/**
 * 옛 원시 Set-Cookie 한 줄을 v3의 이름·값·속성으로 옮긴다 (ADR 0017).
 *
 * 가를 수 없으면 **원시 그대로 보존**한다 — 그러면 컴파일이 그 줄을 그대로 내보내므로
 * 나가는 헤더가 이전과 같다. 이미 v3인 항목(`name`을 가진)은 손대지 않아, 이 변환이 여러 번
 * 돌아도 결과가 같다.
 */
export function migrateSetCookieToV3(value: unknown): unknown {
  // 이미 v3다 — 두 변형 중 어느 쪽이든 손대지 않는다(그래서 여러 번 돌아도 결과가 같다).
  if (
    !isRecord(value) ||
    value.kind !== 'set-cookie' ||
    value.raw !== undefined ||
    typeof value.name === 'string'
  ) {
    return value;
  }
  const line = typeof value.value === 'string' ? value.value : '';
  const parts = parseSetCookieLine(line);
  if (parts) return { ...value, ...parts };
  // 원시 변형은 구조화 재료를 **하나도 갖지 않는다** — 둘을 함께 들 수 없게 벗겨서 만든다.
  const raw: Record<string, unknown> = { ...value, raw: line };
  for (const key of SET_COOKIE_PART_KEYS) delete raw[key];
  return raw;
}

/**
 * 이 버전이 더 이상 좁히지 못하는 조건 (ADR 0017) — 벗기면 규칙이 **넓어진다**.
 *
 * 넷 다 "여기엔 걸지 말라"를 말하던 것이라, 사라지면 지금까지 비껴가던 요청에 규칙이
 * 걸리기 시작한다. 그래서 벗기는 것과 **세는 것**이 한 함수 안에 있다 — 세지 않으면
 * 알릴 것이 없고, 알리지 않으면 사용자는 어느 날 규칙이 넓어진 이유를 모른다.
 */
const RETIRED_CONDITION_KEYS = [
  'excludedDomains',
  'initiatorDomains',
  'tabDomains',
  'expiresAt',
] as const;

/**
 * 퇴역 요청 메서드 (ADR 0017) — 목록에서 빠지면 그만큼 규칙이 넓어진다.
 *
 * 정의는 `rules.ts`에 있다: **폼이 고를 수 있는 여섯**과 **업그레이드가 걷어 가는 셋**이
 * 같은 목록에서 파생돼야 갈라지지 않는다. 여기서 다시 적으면 한쪽만 고쳐지는 날이 온다.
 *
 * **이 목록과 위의 조건 키 목록은 `transfer.ts`의 가져오기 공지 문장이 함께 열거한다** —
 * 한쪽만 고치면 그 문장이 조용히 거짓이 된다.
 */
const RETIRED_METHODS = RETIRED_REQUEST_METHODS;

/**
 * 규칙 하나에서 퇴역 조건·메서드를 벗긴다. `widened`는 **넓어졌는가**이지 필드를
 * 만졌는가가 아니다 — 빈 배열은 애초에 아무것도 좁히지 않았으므로 걷어내도 넓어지지 않는다.
 */
function retireConditions(modification: unknown): { modification: unknown; widened: boolean } {
  if (!isRecord(modification) || !isRecord(modification.conditions)) {
    return { modification, widened: false };
  }
  const conditions: Record<string, unknown> = { ...modification.conditions };
  let widened = false;

  for (const key of RETIRED_CONDITION_KEYS) {
    const value = conditions[key];
    if (value === undefined) continue;
    if (Array.isArray(value) ? value.length > 0 : true) widened = true;
    delete conditions[key];
  }

  const methods = conditions.requestMethods;
  if (Array.isArray(methods)) {
    const retired: readonly string[] = RETIRED_METHODS;
    const kept = methods.filter((m) => !retired.includes(m as string));
    if (kept.length !== methods.length) {
      widened = true;
      /*
       * 마지막 하나까지 퇴역이면 목록 자체를 지운다 — 빈 배열은 "어떤 메서드에도 안 걸린다"가
       * 아니라 그냥 조건 없음이고, 저장 모양을 normalizeConditions와 같게 두어야 다음 저장에서
       * 조용히 달라지지 않는다. 이때 규칙은 **모든 메서드**에 걸리므로 그것도 넓어진 것이다.
       */
      if (kept.length === 0) delete conditions.requestMethods;
      else conditions.requestMethods = kept;
    }
  }

  const next: Record<string, unknown> = { ...modification };
  if (Object.keys(conditions).length > 0) next.conditions = conditions;
  else delete next.conditions;
  return { modification: next, widened };
}

/** 프로필 하나를 올린 결과 — 올린 값과 **조건을 잃은 규칙 수**를 함께 돌려준다. */
export interface ProfileUpgrade {
  /** 올라간 프로필. 검증 전이라 아직 unknown이다. */
  profile: unknown;
  /** 조건을 잃은 규칙 수. 규칙 하나가 여럿을 잃어도 하나로 센다. */
  retired: number;
}

/**
 * 프로필 하나를 현재 포맷까지 올린다 — **순서가 계약이다** (ADR 0017, structure r1 S-3).
 *
 * 실체화가 재구조화보다 **먼저**다. 진짜 v1 상태는 규칙 조건을 갖고 있지 않다 — 그것들은
 * 프로필 수준 레거시 필터에서 실체화가 만들어 낸다. 순서가 뒤집히면 조건을 다루는 변환이
 * 아직 태어나지 않은 것을 찾다가 아무것도 못 찾고 통과한다.
 *
 * **저장소와 가져오기가 이 함수 하나를 함께 지난다.** 예전에는 재구조화가 버전을 모르는
 * 백필 안에 숨어 있어, 저장소는 실체화→재구조화 순서로 가는데 가져오기는 그 반대로 갔다.
 * 티켓 02가 퇴역·집계를 얹을 자리도 여기 하나뿐이라, 한 곳만 고치면 두 문이 같이 따라온다.
 *
 * 이미 올라간 항목은 손대지 않으므로 여러 번 불려도 결과가 같다.
 */
export function upgradeProfile(value: unknown): ProfileUpgrade {
  if (!isRecord(value)) return { profile: value, retired: 0 };
  const materialized = migrateProfileFilters(value);
  if (!Array.isArray(materialized.modifications)) return { profile: materialized, retired: 0 };

  /*
   * 벗기기가 실체화 **뒤**인 것이 이 순서의 요점이다 (티켓 02). 진짜 v1 상태에는 규칙 조건이
   * 없다 — 퇴역 대상은 레거시 필터에서 실체화가 만들어 낸다. 앞에 두면 아직 태어나지 않은
   * 것을 찾다가 아무것도 못 찾고 통과하고, 그 뒤 실체화가 퇴역 대상을 새로 만들어 커밋한다.
   */
  let retired = 0;
  const modifications = materialized.modifications.map((m) => {
    const { modification, widened } = retireConditions(migrateSetCookieToV3(m));
    if (widened) retired += 1;
    return modification;
  });
  return { profile: dropRetiredProfileFields({ ...materialized, modifications }), retired };
}

/**
 * 옛 상태를 v3까지 올리는 단 하나의 문 (ADR 0017).
 *
 * `migrateStoredStateV1ToV2`와 같은 이유로 목적지 숫자를 리터럴로 찍는다 — 상수를 찍으면
 * 다음 버전이 올라간 순간 옛 데이터가 아무 변환 없이 새 버전으로 라벨링된다.
 */
function upgradeToCurrent(value: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(value.profiles)) return { ...value, schemaVersion: 3 };
  const upgraded = value.profiles.map(upgradeProfile);
  const rules = upgraded.reduce((sum, u) => sum + u.retired, 0);
  const next: Record<string, unknown> = {
    ...value,
    schemaVersion: 3,
    profiles: upgraded.map((u) => u.profile),
  };
  /*
   * 아무것도 넓어지지 않았으면 공지를 담지 않는다 — `{ rules: 0 }`을 담으면 확인 버튼이
   * 이유 없이 서고, 부재가 곧 "알릴 것이 없다"라는 필드의 계약도 깨진다.
   */
  if (rules > 0) next.retirementNotice = { rules };
  return next;
}

/**
 * 퇴역 공지의 형 검증 — theme·badgeVisible과 같은 계열의 **치유** 대상이다 (티켓 02).
 *
 * 읽을 수 없으면 상태 전체를 리셋하는 대신 **공지 없음**으로 접는다. 깨진 공지 하나가
 * 프로필을 날릴 이유가 없다. 0 이하는 알릴 것이 없다는 뜻이므로 부재와 같게 다룬다 —
 * 그러지 않으면 아무것도 넓어지지 않았는데 확인 버튼만 서 있는 화면이 나온다.
 */
function readRetirementNotice(value: unknown): RetirementNotice | undefined {
  if (!isRecord(value)) return undefined;
  const { rules } = value;
  return typeof rules === 'number' && Number.isInteger(rules) && rules > 0 ? { rules } : undefined;
}

/** 검증을 통과한 StoredState거나, 통과하지 못하면 null. 분류와 검증을 나눠 둔다. */
function validateStoredState(value: Record<string, unknown>): StoredState | null {
  if (typeof value.paused !== 'boolean' || !Array.isArray(value.profiles)) return null;
  /*
   * 공지는 **키째** 떼어 놓고 치유된 값만 다시 얹는다 (code-review). 스프레드에 남겨 두면
   * 모양이 깨진 원본이 그대로 통과하고, `retirementNotice: undefined`로 덮으면 이번엔 키가
   * 실체화되어 "부재가 곧 알릴 것이 없다"는 계약이 읽기 경로에서만 깨진다.
   */
  const { retirementNotice: rawNotice, ...rest } = value;
  const retirementNotice = readRetirementNotice(rawNotice);
  const profiles = value.profiles.map(backfillProfile);
  const materialized = value.materialized ?? {};
  /*
   * 제안 이력 셋은 **검증보다 먼저** 기본값을 받는다 (티켓 08). 순서가 계약이다 — 검증이 먼저
   * 보면 없던 필드 하나 때문에 상태 전체가 기본값으로 교체되어 프로필이 사라진다. 문자열이
   * 아닌 항목은 조용히 걸러 낸다: 목록 하나가 프로필을 날릴 이유가 없다.
   */
  const stringList = (raw: unknown): string[] =>
    Array.isArray(raw) ? raw.filter((n): n is string => typeof n === 'string') : [];
  const customHeaderNames = stringList(value.customHeaderNames);
  const customCookieNames = stringList(value.customCookieNames);
  const customUserAgents = stringList(value.customUserAgents);
  /*
   * 테마는 백필·치유 대상이다 (ADR 0015). 필드가 없는 예전 상태나 알 수 없는 값 때문에
   * 검증을 실패시키면 상태 **전체**가 기본값으로 리셋되어 프로필이 사라진다 — 명암 하나가
   * 프로필을 날릴 이유가 없다. 그릴 수 없는 값은 여기서 기본값으로 접어 화면까지 가지 않게 한다.
   */
  const theme = isThemePreference(value.theme) ? value.theme : DEFAULT_THEME;
  // 배지 표시도 같은 이유로 백필·치유 대상이다 — 툴바 배지 하나가 프로필을 날릴 수 없다.
  const badgeVisible =
    typeof value.badgeVisible === 'boolean' ? value.badgeVisible : DEFAULT_BADGE_VISIBLE;
  /*
   * 백업 저장 위치도 같은 계열의 백필·치유 대상이다 — 필드가 없던 기존 설치는 sync ON으로
   * 읽혀 자기 클라우드 히스토리를 그대로 보고, 알 수 없는 값 때문에 상태 전체가 리셋되지 않는다.
   */
  const syncBackup =
    typeof value.syncBackup === 'boolean' ? value.syncBackup : DEFAULT_SYNC_BACKUP;
  /*
   * 언어 선호도 같은 계열의 치유 대상이다 (티켓 09). 지원하지 않는 값(번역이 없는 'ja' 등)이
   * 들어와도 상태 전체를 리셋하지 않고 **선호 없음**으로 접는다 — 그러면 화면은 브라우저 UI
   * 언어로 돌아가고, 카탈로그에 없는 로케일을 번역기에 넘겨 undefined 문자열을 그리는 일이 없다.
   */
  const locale = isLocale(value.locale) ? value.locale : undefined;
  if (!profiles.every(isProfile) || !isMaterializedRecord(materialized)) return null;
  return {
    ...rest,
    ...(retirementNotice ? { retirementNotice } : {}),
    theme,
    badgeVisible,
    syncBackup,
    locale,
    profiles,
    materialized,
    customHeaderNames,
    customCookieNames,
    customUserAgents,
  } as unknown as StoredState;
}

/**
 * 저장된 값을 분류해 읽는다 — 버전 호환성의 단일 판단 지점.
 *
 * 순수 함수이고 부수 효과가 없다. 마이그레이션한 상태를 **저장하는** 것은 호출부의 몫이라,
 * 검증에 실패하면 아무것도 쓰이지 않는다("검증 성공 후에만 v2로 persist").
 */
export function readStoredState(value: unknown): StoredStateRead {
  if (!isRecord(value)) return { status: 'reset', state: createDefaultState() };

  const storedVersion = value.schemaVersion;
  if (typeof storedVersion !== 'number') {
    // 버전이 없으면 우리가 쓴 상태가 아니다 — 덮어써도 잃을 것이 없다.
    return { status: 'reset', state: createDefaultState() };
  }

  // 미래 포맷은 변형하지 않는다. 이 버전이 이해 못 하는 필드를 지우고 되쓰면
  // 최신 버전으로 돌아갔을 때 그 필드가 사라져 있다.
  if (storedVersion > SCHEMA_VERSION) {
    return { status: 'blocked', reason: 'newer', storedVersion };
  }

  if (storedVersion === SCHEMA_VERSION) {
    const state = validateStoredState(value);
    // 현재 버전인데 형태가 깨졌다면 우리가 쓴 것이 손상된 것이다 — 기존 계약대로
    // 기본 상태로 시작한다(반쯤 깨진 상태로 규칙을 컴파일하지 않는다).
    return state ? { status: 'ok', state } : { status: 'reset', state: createDefaultState() };
  }

  // 마이그레이션이 실패하면 **기본 상태로 갈아치우지 않는다** — 원본을 그대로 두어
  // 사용자가 되돌리거나 내보내 살릴 수 있게 한다.
  if (storedVersion === 1) {
    // 두 단계를 이어 붙인다 — v2를 건너뛴 사용자와 v2를 거친 사용자가 같은 곳에 도착한다.
    const state = validateStoredState(upgradeToCurrent(migrateStoredStateV1ToV2(value)));
    return state
      ? { status: 'migrated', from: 1, state }
      : { status: 'blocked', reason: 'unmigratable', storedVersion };
  }

  if (storedVersion === 2) {
    const state = validateStoredState(upgradeToCurrent(value));
    return state
      ? { status: 'migrated', from: 2, state }
      : { status: 'blocked', reason: 'unmigratable', storedVersion };
  }

  // 알 수 없는 과거 버전(0·음수 등) — 마이그레이션 경로가 없으니 손대지 않는다.
  return { status: 'blocked', reason: 'unmigratable', storedVersion };
}

/**
 * 이 값 위에 새 상태를 써도 되는가. `false`면 써서는 안 된다.
 *
 * 쓰기 경로가 읽기 경로와 **따로** 판단하지 않도록 같은 분류를 재사용한다. 로드 때
 * blocked였는데 저장 때 그 사실을 잊으면, 화면에 떠 있던 기본 상태가 원본을 덮는다.
 */
export function isBlockedFromOverwrite(existing: unknown): boolean {
  return readStoredState(existing).status === 'blocked';
}

/**
 * 저장소에서 읽은 알 수 없는 값을 StoredState로 검증한다.
 *
 * `readStoredState`의 얇은 래퍼 — 상태 하나만 필요한 호출부를 위한 것이다. **blocked도
 * 기본 상태로 접히므로**, 그 상태를 저장할 수 있는 경로에서는 이것 대신 `readStoredState`를
 * 쓰고 blocked를 직접 다뤄야 한다(그렇지 않으면 원본을 덮는다).
 */
export function parseStoredState(value: unknown): StoredState {
  const read = readStoredState(value);
  return read.status === 'blocked' ? createDefaultState() : read.state;
}
