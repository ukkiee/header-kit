import { isProfileExpired } from './expiry';
import { hasPlaceholders } from './placeholder';
import type { Filter, HeaderMode, Modification, Profile } from './schema';
import { placeholderTemplate, UNSET_ID } from './schema';

/** 값·mode를 가진 Modification 종류 (header/cookie/set-cookie). */
type ValueModification = Extract<Modification, { mode: HeaderMode }>;
import type { CompileWarning } from './compile-warnings';
import {
  ALL_RESOURCE_TYPES,
  isRequestAppendAllowed,
  type HeaderInfo,
  type NetRule,
  type RequestMethod,
  type ResourceType,
} from './rules';

/** 탭 상태 스냅샷 — 어댑터가 tabs API에서 만들어 env로 주입한다. */
export interface TabInfo {
  tabId: number;
  windowId: number;
  /** 그룹 미소속은 -1. */
  groupId: number;
  url?: string;
}

export interface CompileEnv {
  paused: boolean;
  /** 열린 탭 스냅샷 — 탭 계열 Filter의 전개에 쓰인다. */
  tabs: TabInfo[];
  /** 현재 시각(ms) — Time Filter 만료 방어층에 쓰인다. */
  now: number;
  /** Placeholder 실체화 구역 — Compile은 소비만 하고 절대 생성하지 않는다. */
  materialized: Record<string, string>;
}

export interface CompileResult {
  rules: NetRule[];
  warnings: CompileWarning[];
}

/** Profile 대역 상단에 Exclude Filter의 allow 규칙이 들어갈 자리. */
const EXCLUDE_ALLOW_SLOTS = 1;

/**
 * regexFilter는 컴파일 후 2KB 미만이어야 한다. 컴파일 크기는 순수하게 측정할
 * 수 없으므로 보수적인 소스 길이 휴리스틱으로 OR-join을 끊는다.
 */
export const REGEX_JOIN_LIMIT = 1500;

/** session rules 총량 한도 — 이슈 01 스모크에서 실측 확인(5,000에서 거부). */
const TOTAL_RULE_LIMIT = 5000;
/** regex 조건 규칙의 타입별 한도. */
const REGEX_RULE_LIMIT = 1000;

interface CompiledFilters {
  /** 각 원소가 규칙 하나의 regexFilter — URL Filter가 없으면 [undefined]. */
  regexJoins: Array<string | undefined>;
  resourceTypes: ResourceType[] | undefined;
  requestMethods: RequestMethod[] | undefined;
  initiatorDomains: string[] | undefined;
  /**
   * 탭 계열 Filter의 전개 결과. undefined = 탭 조건 없음,
   * 빈 배열 = 매칭 탭 없음(Modification 규칙을 내지 않는다).
   */
  tabIds: number[] | undefined;
  /** Exclude Filter의 allow 규칙용 join들. */
  excludeJoins: string[];
}

function hostnameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function domainMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * 탭 계열 Filter 4종을 tabIds로 전개한다 — 같은 kind끼리 합집합(OR),
 * kind 사이는 교집합(AND). 탭 조건이 하나도 없으면 undefined.
 */
function expandTabIds(filters: Filter[], tabs: TabInfo[]): number[] | undefined {
  const sets: number[][] = [];
  const byKind = <K extends Filter['kind']>(kind: K) =>
    filters.filter((f): f is Extract<Filter, { kind: K }> => f.kind === kind && f.enabled);

  // 미설정(UNSET_ID) 값은 빈 패턴·빈 도메인과 동일하게 무시한다 — 일관된 fail-open.
  const idKinds = [
    { wanted: byKind('tab').map((f) => f.tabId), key: (t: TabInfo) => t.tabId },
    { wanted: byKind('tab-group').map((f) => f.groupId), key: (t: TabInfo) => t.groupId },
    { wanted: byKind('window').map((f) => f.windowId), key: (t: TabInfo) => t.windowId },
  ];
  for (const { wanted, key } of idKinds) {
    const ids = wanted.filter((id) => id !== UNSET_ID);
    if (ids.length === 0) continue;
    const set = new Set(ids);
    sets.push(tabs.filter((t) => set.has(key(t))).map((t) => t.tabId));
  }

  const domains = byKind('tab-domain')
    .map((f) => f.domain.trim())
    .filter((d) => d !== '');
  if (domains.length > 0) {
    sets.push(
      tabs
        .filter((t) => {
          const hostname = hostnameOf(t.url);
          return hostname !== null && domains.some((d) => domainMatches(hostname, d));
        })
        .map((t) => t.tabId),
    );
  }

  if (sets.length === 0) return undefined;
  return sets.reduce((acc, set) => acc.filter((id) => set.includes(id)));
}


function joinPatterns(
  filters: Array<{ id: string; pattern: string }>,
  profileId: string,
  warnings: CompileWarning[],
): string[] {
  const joins: string[] = [];
  let current = '';

  for (const { id, pattern } of filters) {
    const wrapped = `(?:${pattern})`;
    if (wrapped.length > REGEX_JOIN_LIMIT) {
      warnings.push({
        code: 'regex-too-long',
        profileId,
        filterId: id,
        limit: REGEX_JOIN_LIMIT,
      });
      continue;
    }
    const candidate = current === '' ? wrapped : `${current}|${wrapped}`;
    if (candidate.length > REGEX_JOIN_LIMIT) {
      joins.push(current);
      current = wrapped;
    } else {
      current = candidate;
    }
  }
  if (current !== '') joins.push(current);
  return joins;
}

function compileFilters(
  profile: Profile,
  tabs: TabInfo[],
  warnings: CompileWarning[],
): CompiledFilters {
  const enabled = profile.filters.filter((f) => f.enabled);
  const byKind = <K extends Filter['kind']>(kind: K) =>
    enabled.filter((f): f is Extract<Filter, { kind: K }> => f.kind === kind);

  const urlFilters = byKind('url')
    .map((f) => ({ id: f.id, pattern: f.pattern.trim() }))
    .filter((f) => f.pattern !== '');
  const excludeFilters = byKind('exclude-url')
    .map((f) => ({ id: f.id, pattern: f.pattern.trim() }))
    .filter((f) => f.pattern !== '');

  const resourceTypes = [...new Set(byKind('resource-type').flatMap((f) => f.resourceTypes))];
  const requestMethods = [...new Set(byKind('request-method').flatMap((f) => f.methods))];
  const initiatorDomains = [
    ...new Set(
      byKind('initiator-domain')
        .map((f) => f.domain.trim())
        .filter((d) => d !== ''),
    ),
  ];

  const regexJoins = joinPatterns(urlFilters, profile.id, warnings);
  return {
    regexJoins: regexJoins.length > 0 ? regexJoins : [undefined],
    resourceTypes: resourceTypes.length > 0 ? resourceTypes : undefined,
    requestMethods: requestMethods.length > 0 ? requestMethods : undefined,
    initiatorDomains: initiatorDomains.length > 0 ? initiatorDomains : undefined,
    tabIds: expandTabIds(enabled, tabs),
    excludeJoins: joinPatterns(excludeFilters, profile.id, warnings),
  };
}

interface Emitter {
  rules: NetRule[];
  warnings: CompileWarning[];
  regexCount: number;
  warned: Set<string>;
  nextId: number;
  materialized: Record<string, string>;
}

function emitRule(
  emitter: Emitter,
  rule: Omit<NetRule, 'id'>,
  origin: { profileId: string; modificationId?: string },
): void {
  const usesRegex = rule.condition.regexFilter !== undefined;
  const quota: 'total-rules' | 'regex-rules' | null =
    emitter.rules.length >= TOTAL_RULE_LIMIT
      ? 'total-rules'
      : usesRegex && emitter.regexCount >= REGEX_RULE_LIMIT
        ? 'regex-rules'
        : null;

  if (quota) {
    // 항목 단위 경고 — 어느 Modification이 빠졌는지 각각 알린다 (같은 항목의
    // 분할 규칙 변형만 하나로 접는다).
    const key = `${quota}:${origin.profileId}:${origin.modificationId ?? ''}`;
    if (!emitter.warned.has(key)) {
      emitter.warned.add(key);
      emitter.warnings.push({
        code: 'quota-exceeded',
        quota,
        profileId: origin.profileId,
        modificationId: origin.modificationId,
        limit: quota === 'total-rules' ? TOTAL_RULE_LIMIT : REGEX_RULE_LIMIT,
      });
    }
    return;
  }

  if (usesRegex) emitter.regexCount += 1;
  emitter.rules.push({ id: emitter.nextId++, ...rule });
}

function conditionFor(
  compiled: CompiledFilters,
  regexFilter: string | undefined,
): NetRule['condition'] {
  return {
    ...(regexFilter !== undefined ? { regexFilter } : {}),
    resourceTypes: compiled.resourceTypes ?? [...ALL_RESOURCE_TYPES],
    ...(compiled.requestMethods ? { requestMethods: compiled.requestMethods } : {}),
    ...(compiled.initiatorDomains ? { initiatorDomains: compiled.initiatorDomains } : {}),
    ...(compiled.tabIds !== undefined ? { tabIds: compiled.tabIds } : {}),
  };
}

/** Placeholder가 있으면 실체화 값을, 없으면 템플릿을 소비한다 (방어선 보증). */
function consumeValue(rawValue: string, id: string, emitter: Emitter): string {
  return hasPlaceholders(rawValue) ? emitter.materialized[id]! : rawValue;
}

interface HeaderPlan {
  header: string;
  isRequest: boolean;
  /** 빈 값 판정에 쓰는 사용자 값. */
  userValue: string;
  /** set/append에 실릴 실제 헤더 값. */
  composedValue: string;
  /** 비어 있으면 empty-header-name 경고 대상인 이름 (set-cookie는 항상 non-empty). */
  nameForWarning: string;
}

/** header/cookie/set-cookie를 공통 HeaderPlan으로 정규화한다. */
function planHeaderish(modification: ValueModification, emitter: Emitter): HeaderPlan {
  const v = consumeValue(modification.value, modification.id, emitter);
  switch (modification.kind) {
    case 'request-header':
    case 'response-header':
      return {
        header: modification.name.trim(),
        isRequest: modification.kind === 'request-header',
        userValue: v,
        composedValue: v,
        nameForWarning: modification.name.trim(),
      };
    case 'cookie': {
      const cookieName = modification.name.trim();
      return {
        header: 'Cookie',
        isRequest: true,
        userValue: v,
        composedValue: cookieName === '' ? v : `${cookieName}=${v}`,
        nameForWarning: cookieName,
      };
    }
    case 'set-cookie':
      return {
        header: 'Set-Cookie',
        isRequest: false,
        userValue: v,
        composedValue: v,
        nameForWarning: 'Set-Cookie',
      };
    default:
      return modification satisfies never;
  }
}

function emitModification(
  modification: Modification,
  priority: number,
  profileId: string,
  compiled: CompiledFilters,
  emitter: Emitter,
): void {
  switch (modification.kind) {
    case 'request-header':
    case 'response-header':
    case 'cookie':
    case 'set-cookie':
      emitHeaderRule(modification, priority, profileId, compiled, emitter);
      return;
    case 'csp':
      emitCspRule(modification, priority, profileId, compiled, emitter);
      return;
    case 'redirect':
      emitRedirectRule(modification, priority, profileId, compiled, emitter);
      return;
    default:
      modification satisfies never;
  }
}


/**
 * 규칙 자체 URL 필터 (ADR 0007) — 있으면 그 규칙의 조인을 대체한다.
 * 한도 초과면 null(방출 금지 신호) — 스코프를 조용히 넓히지 않는다.
 */
function ownScopeJoins(
  modification: { id: string; urlFilter?: string },
  profileId: string,
  emitter: Emitter,
): Array<string | undefined> | null | undefined {
  const pattern = modification.urlFilter?.trim() ?? '';
  if (pattern === '') return undefined; // 자체 필터 없음 — 프로필 조인 사용
  if (pattern.length > REGEX_JOIN_LIMIT) {
    emitter.warnings.push({
      code: 'regex-too-long',
      profileId,
      modificationId: modification.id,
      limit: REGEX_JOIN_LIMIT,
    });
    return null; // 방출 금지
  }
  return [pattern];
}

function emitHeaderRule(
  modification: ValueModification,
  priority: number,
  profileId: string,
  compiled: CompiledFilters,
  emitter: Emitter,
): void {
  const plan = planHeaderish(modification, emitter);

  if (plan.nameForWarning.trim() === '') {
    emitter.warnings.push({
      code: 'empty-header-name',
      profileId,
      modificationId: modification.id,
    });
    return;
  }

  // 자체 필터 초과로 방출이 없을 규칙에 append 경고를 내지 않도록 먼저 검사한다.
  const own = ownScopeJoins(modification, profileId, emitter);
  if (own === null) return; // 자체 필터가 한도 초과 — 규칙 없음 (경고로 알림)
  const info = resolveHeaderInfo(plan, modification, profileId, emitter);
  for (const join of own ?? compiled.regexJoins) {
    emitRule(
      emitter,
      {
        priority,
        action: {
          type: 'modifyHeaders',
          ...(plan.isRequest ? { requestHeaders: [info] } : { responseHeaders: [info] }),
        },
        condition: conditionFor(compiled, join),
      },
      { profileId, modificationId: modification.id },
    );
  }
}

/** mode/emptyMeans를 DNR HeaderInfo 연산으로 변환한다. */
function resolveHeaderInfo(
  plan: HeaderPlan,
  modification: ValueModification,
  profileId: string,
  emitter: Emitter,
): HeaderInfo {
  // 빈 값의 의미: remove(제거) vs send-empty(빈 문자열 전송).
  if (plan.userValue === '' && modification.emptyMeans === 'remove') {
    return { header: plan.header, operation: 'remove' };
  }

  if (modification.mode === 'append') {
    // 요청 헤더 append는 허용 목록에 있어야만 가능 — 밖이면 set으로 폴백하고 경고.
    if (plan.isRequest && !isRequestAppendAllowed(plan.header)) {
      emitter.warnings.push({
        code: 'append-not-allowed',
        profileId,
        modificationId: modification.id,
        header: plan.header,
      });
      return { header: plan.header, operation: 'set', value: plan.composedValue };
    }
    return { header: plan.header, operation: 'append', value: plan.composedValue };
  }

  return { header: plan.header, operation: 'set', value: plan.composedValue };
}

function emitCspRule(
  modification: Extract<Modification, { kind: 'csp' }>,
  priority: number,
  profileId: string,
  compiled: CompiledFilters,
  emitter: Emitter,
): void {
  const value = modification.directives
    .map((d) => `${d.name.trim()} ${d.value.trim()}`.trim())
    .filter((d) => d !== '')
    .join('; ');
  if (value === '') return; // 빈 CSP는 규칙을 만들지 않는다

  const own = ownScopeJoins(modification, profileId, emitter);
  if (own === null) return; // 자체 필터가 한도 초과 — 규칙 없음 (경고로 알림)
  for (const join of own ?? compiled.regexJoins) {
    emitRule(
      emitter,
      {
        priority,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [{ header: 'Content-Security-Policy', operation: 'set', value }],
        },
        condition: conditionFor(compiled, join),
      },
      { profileId, modificationId: modification.id },
    );
  }
}

function emitRedirectRule(
  modification: Extract<Modification, { kind: 'redirect' }>,
  priority: number,
  profileId: string,
  compiled: CompiledFilters,
  emitter: Emitter,
): void {
  const pattern = modification.pattern.trim();
  if (pattern === '') return; // 매칭 패턴이 없으면 규칙 없음

  // redirect는 자기 pattern을 regexFilter로 쓰고, profile의 나머지 필터(메서드·
  // initiator·resource type·탭)를 그대로 상속한다. profile의 URL 필터는 redirect
  // 패턴이 URL 매칭 역할을 대신하므로 추가 결합하지 않는다.
  emitRule(
    emitter,
    {
      priority,
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: modification.substitution },
      },
      condition: conditionFor(compiled, pattern),
    },
    { profileId, modificationId: modification.id },
  );
}

/**
 * 불변식 검사: 활성 Profile의 enabled Placeholder Modification에 실체화 값이
 * 빠져 있으면 그 Profile 전체를 규칙에서 제외한다 (PRD 방어선).
 */
function findMissingMaterialization(
  profile: Profile,
  materialized: Record<string, string>,
): Modification | undefined {
  return profile.modifications.find((m) => {
    const template = placeholderTemplate(m);
    return m.enabled && template !== null && hasPlaceholders(template) && !(m.id in materialized);
  });
}

/**
 * 저장된 Profile 전체를 선언적 네트워크 규칙 집합으로 변환하는 순수 함수.
 * 규칙 상태는 항상 이 함수 출력과 일치해야 한다 (ADR-0002).
 *
 * 충돌 의미론 (PRD): 목록 위쪽 Profile이 이긴다. 활성 Profile마다 분리된
 * priority 대역을 아래에서 위로 할당하고, 대역 안에서는 앞선 Modification이
 * 더 높은 priority를 받는다. Filter는 같은 kind끼리 OR, 다른 kind끼리 AND로
 * 합성되며, Exclude URL은 대역 상단의 allow 규칙이 되어 자기보다 낮은
 * 우선순위 Profile까지 하향 전파된다.
 */
export function compile(profiles: Profile[], env: CompileEnv): CompileResult {
  const emitter: Emitter = {
    rules: [],
    warnings: [],
    regexCount: 0,
    warned: new Set(),
    nextId: 1,
    materialized: env.materialized,
  };

  if (env.paused) {
    return { rules: emitter.rules, warnings: emitter.warnings };
  }

  const { tabs, now } = env;
  const active = profiles.filter((p) => p.active && !isProfileExpired(p, now));

  const bandBase = new Map<string, number>();
  let cursor = 1;
  for (let i = active.length - 1; i >= 0; i -= 1) {
    const profile = active[i]!;
    bandBase.set(profile.id, cursor);
    cursor +=
      profile.modifications.filter((m) => m.enabled).length + EXCLUDE_ALLOW_SLOTS;
  }

  const headerUse = new Map<string, string[]>();

  for (const profile of active) {
    const missing = findMissingMaterialization(profile, env.materialized);
    if (missing) {
      emitter.warnings.push({
        code: 'missing-materialization',
        profileId: profile.id,
        modificationId: missing.id,
      });
      continue;
    }

    const enabled = profile.modifications.filter((m) => m.enabled);
    const base = bandBase.get(profile.id)!;
    const compiled = compileFilters(profile, tabs, emitter.warnings);

    // 탭 조건이 있는데 매칭 탭이 없으면(탭 닫힘 등) 이 Profile은 어디에도
    // 적용되지 않는다 — Modification 규칙도, Exclude allow 규칙도 내지 않는다.
    const noMatchingTabs = compiled.tabIds !== undefined && compiled.tabIds.length === 0;
    if (noMatchingTabs) continue;

    // Exclude allow 규칙은 소유 Profile의 전체 Filter 스코프(메서드·initiator·
    // resource type·탭)를 그대로 쓴다 — Exclude가 자기 Profile의 조건을 벗어나
    // 전역으로 다른 Profile까지 무효화하지 않도록 (RL-2). quota 압력에서
    // 살아남도록 Modification보다 먼저 낸다.
    const allowPriority = base + enabled.length + EXCLUDE_ALLOW_SLOTS - 1;
    for (const join of compiled.excludeJoins) {
      emitRule(
        emitter,
        {
          priority: allowPriority,
          action: { type: 'allow' },
          condition: conditionFor(compiled, join),
        },
        { profileId: profile.id },
      );
    }

    enabled.forEach((modification, index) => {
      emitModification(
        modification,
        base + enabled.length - 1 - index,
        profile.id,
        compiled,
        emitter,
      );
      // 겹침 경고는 헤더 이름 있는 종류(request/response-header)에만 의미가 있다.
      if (modification.kind === 'request-header' || modification.kind === 'response-header') {
        const name = modification.name.trim().toLowerCase();
        if (name !== '') {
          const headerKey = `${modification.kind}:${name}`;
          const users = headerUse.get(headerKey) ?? [];
          if (!users.includes(profile.id)) users.push(profile.id);
          headerUse.set(headerKey, users);
        }
      }
    });
  }

  for (const [headerKey, profileIds] of headerUse) {
    if (profileIds.length > 1) {
      const header = headerKey.slice(headerKey.indexOf(':') + 1);
      emitter.warnings.push({
        code: 'header-overlap',
        header,
        profileIds,
      });
    }
  }

  return { rules: emitter.rules, warnings: emitter.warnings };
}
