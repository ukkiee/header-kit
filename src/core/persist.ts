import { isLocale } from './i18n';
import { ALL_RESOURCE_TYPES, REQUEST_METHODS, type RequestMethod, type ResourceType } from './rules';
import { DEFAULT_THEME, isThemePreference } from './theme';
import {
  createDefaultState,
  DEFAULT_BADGE_VISIBLE,
  DEFAULT_SYNC_BACKUP,
  parseSetCookieLine,
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

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

/** v3 응답 쿠키의 선택 필드 형 검증 (ADR 0017) — 이름·값은 호출부가 따로 본다. */
function isSetCookieShape(value: Record<string, unknown>): boolean {
  return (
    isOptionalString(value.raw) &&
    isOptionalString(value.domain) &&
    isOptionalString(value.path) &&
    isOptionalString(value.maxAge) &&
    (value.sameSite === undefined ||
      value.sameSite === 'none' ||
      value.sameSite === 'lax' ||
      value.sameSite === 'strict') &&
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
      return typeof value.name === 'string' && isSetCookieShape(value) && isHeaderish(value);
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
    typeof value.shortLabel === 'string' &&
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
    // v3에서 응답 쿠키가 얻은 이름 — **검증보다 먼저** 기본값을 받아야 한다. 검증이 먼저
    // 보면 이름 없는 옛 항목이 무효가 되어 상태 전체가 기본값으로 리셋된다.
    ...(value.kind === 'set-cookie' ? { name: '' } : {}),
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
 * v1 내부 반복 중 추가된 선택 필드를 기본값으로 채운다.
 * 필드 추가가 기존 저장 상태를 전량 거부로 파괴하면 안 된다 (SSOT 보호).
 */
function backfillProfile(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const base = {
    shortLabel: typeof value.name === 'string' ? value.name.charAt(0).toUpperCase() : '',
    color: PROFILE_COLORS[0],
    ...value,
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
 * 레거시 프로필 필터를 규칙 조건으로 실체화한다 — 상태 수준 래퍼 (ADR 0017).
 *
 * **v2→v3보다 먼저 돌아야 한다.** 진짜 v1 상태는 규칙 조건을 갖고 있지 않다 — 그것들은
 * 프로필 수준 레거시 필터에서 이 변환이 만들어 낸다. 퇴역 게이트를 이보다 앞에 두면 아직
 * 태어나지 않은 것을 찾다가 아무것도 못 찾고, 그 뒤에 검증이 퇴역 대상을 새로 만들어 커밋한다.
 *
 * 필터 키가 없으면 즉시 반환하므로 검증 안에서 다시 불려도 무해하다.
 */
function materializeLegacyFilters(value: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(value.profiles)) return value;
  return {
    ...value,
    profiles: value.profiles.map((p) => (isRecord(p) ? migrateProfileFilters(p) : p)),
  };
}

/**
 * 옛 원시 Set-Cookie 한 줄을 v3의 이름·값·속성으로 옮긴다 (ADR 0017).
 *
 * 가를 수 없으면 **원시 그대로 보존**한다 — 그러면 컴파일이 그 줄을 그대로 내보내므로
 * 나가는 헤더가 이전과 같다. 이미 v3인 항목(`name`을 가진)은 손대지 않아, 이 변환이 여러 번
 * 돌아도 결과가 같다.
 */
export function migrateSetCookieToV3(value: unknown): unknown {
  if (!isRecord(value) || value.kind !== 'set-cookie' || typeof value.name === 'string') {
    return value;
  }
  const line = typeof value.value === 'string' ? value.value : '';
  const parts = parseSetCookieLine(line);
  return parts ? { ...value, ...parts } : { ...value, name: '', value: '', raw: line };
}

/**
 * v2 → v3 마이그레이션 (ADR 0017) — 응답 쿠키 재구조화.
 *
 * `migrateStoredStateV1ToV2`와 같은 이유로 목적지 숫자를 리터럴로 찍는다.
 */
function migrateStoredStateV2ToV3(value: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(value.profiles)) return { ...value, schemaVersion: 3 };
  return {
    ...value,
    schemaVersion: 3,
    profiles: value.profiles.map((p) =>
      isRecord(p) && Array.isArray(p.modifications)
        ? { ...p, modifications: p.modifications.map(migrateSetCookieToV3) }
        : p,
    ),
  };
}

/**
 * 옛 상태를 v3까지 올리는 단 하나의 문 — 순서가 계약이다 (ADR 0017).
 *
 * 실체화가 퇴역·재구조화보다 **먼저**다. 이 순서가 티켓 02의 퇴역이 실제로 대상을 볼 수
 * 있게 하는 자리이고, 여기서 뒤집히면 퇴역이 아무것도 못 찾은 채 통과한다.
 */
function upgradeToCurrent(value: Record<string, unknown>): Record<string, unknown> {
  return migrateStoredStateV2ToV3(materializeLegacyFilters(value));
}

/** 검증을 통과한 StoredState거나, 통과하지 못하면 null. 분류와 검증을 나눠 둔다. */
function validateStoredState(value: Record<string, unknown>): StoredState | null {
  if (typeof value.paused !== 'boolean' || !Array.isArray(value.profiles)) return null;
  const profiles = value.profiles.map(backfillProfile);
  const materialized = value.materialized ?? {};
  const customHeaderNames = Array.isArray(value.customHeaderNames)
    ? value.customHeaderNames.filter((n): n is string => typeof n === 'string')
    : [];
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
    ...value,
    theme,
    badgeVisible,
    syncBackup,
    locale,
    profiles,
    materialized,
    customHeaderNames,
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
