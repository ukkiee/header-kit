import type { Filter, Modification, Profile } from './schema';
import {
  ALL_RESOURCE_TYPES,
  type CompileWarning,
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
  tabs?: TabInfo[];
  /** 현재 시각(ms) — Time Filter 만료 방어층에 쓰인다. */
  now?: number;
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

  const tabFilters = byKind('tab');
  if (tabFilters.length > 0) {
    const wanted = new Set(tabFilters.map((f) => f.tabId));
    sets.push(tabs.filter((t) => wanted.has(t.tabId)).map((t) => t.tabId));
  }

  const groupFilters = byKind('tab-group');
  if (groupFilters.length > 0) {
    const wanted = new Set(groupFilters.map((f) => f.groupId));
    sets.push(tabs.filter((t) => wanted.has(t.groupId)).map((t) => t.tabId));
  }

  const windowFilters = byKind('window');
  if (windowFilters.length > 0) {
    const wanted = new Set(windowFilters.map((f) => f.windowId));
    sets.push(tabs.filter((t) => wanted.has(t.windowId)).map((t) => t.tabId));
  }

  const domainFilters = byKind('tab-domain');
  const domains = domainFilters.map((f) => f.domain.trim()).filter((d) => d !== '');
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

/** 활성 Profile의 enabled Time Filter가 이미 만료됐는가 — 알람 경로의 방어층. */
function isExpired(profile: Profile, now: number): boolean {
  return profile.filters.some(
    (f) => f.kind === 'time' && f.enabled && f.expiresAt <= now,
  );
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
        message: `URL pattern is longer than ${REGEX_JOIN_LIMIT} characters and was skipped.`,
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
        message:
          quota === 'total-rules'
            ? `Session rule limit (${TOTAL_RULE_LIMIT}) exceeded; some modifications are not applied.`
            : `Regex rule limit (${REGEX_RULE_LIMIT}) exceeded; some modifications are not applied.`,
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

function emitModification(
  modification: Modification,
  priority: number,
  profileId: string,
  compiled: CompiledFilters,
  emitter: Emitter,
): void {
  switch (modification.kind) {
    case 'request-header': {
      const header = modification.name.trim();
      if (header === '') {
        emitter.warnings.push({
          code: 'empty-header-name',
          profileId,
          modificationId: modification.id,
          message: 'Header name is empty; the modification was skipped.',
        });
        return;
      }
      for (const join of compiled.regexJoins) {
        emitRule(
          emitter,
          {
            priority,
            action: {
              type: 'modifyHeaders',
              requestHeaders: [{ header, operation: 'set', value: modification.value }],
            },
            condition: conditionFor(compiled, join),
          },
          { profileId, modificationId: modification.id },
        );
      }
      return;
    }
    default:
      modification.kind satisfies never;
  }
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
  };

  if (env.paused) {
    return { rules: emitter.rules, warnings: emitter.warnings };
  }

  const tabs = env.tabs ?? [];
  const now = env.now ?? 0;
  const active = profiles.filter((p) => p.active && !isExpired(p, now));

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
    const enabled = profile.modifications.filter((m) => m.enabled);
    const base = bandBase.get(profile.id)!;
    const compiled = compileFilters(profile, tabs, emitter.warnings);

    // Exclude allow 규칙이 quota 압력에서 살아남도록 Modification보다 먼저 낸다 —
    // 제외가 빠지는 것이 수정이 빠지는 것보다 위험하다.
    const allowPriority = base + enabled.length + EXCLUDE_ALLOW_SLOTS - 1;
    for (const join of compiled.excludeJoins) {
      emitRule(
        emitter,
        {
          priority: allowPriority,
          action: { type: 'allow' },
          condition: { regexFilter: join, resourceTypes: [...ALL_RESOURCE_TYPES] },
        },
        { profileId: profile.id },
      );
    }

    // 탭 조건이 있는데 매칭 탭이 없으면(탭 닫힘 등) 이 Profile의 Modification은
    // 어디에도 적용되지 않는다 — 규칙도 겹침 집계도 내지 않는다.
    const noMatchingTabs = compiled.tabIds !== undefined && compiled.tabIds.length === 0;
    if (noMatchingTabs) continue;

    enabled.forEach((modification, index) => {
      emitModification(
        modification,
        base + enabled.length - 1 - index,
        profile.id,
        compiled,
        emitter,
      );
      if (modification.kind === 'request-header') {
        const header = modification.name.trim().toLowerCase();
        if (header !== '') {
          const users = headerUse.get(header) ?? [];
          if (!users.includes(profile.id)) users.push(profile.id);
          headerUse.set(header, users);
        }
      }
    });
  }

  for (const [header, profileIds] of headerUse) {
    if (profileIds.length > 1) {
      emitter.warnings.push({
        code: 'header-overlap',
        header,
        profileIds,
        message: `Multiple active profiles modify "${header}"; the highest profile in the list wins.`,
      });
    }
  }

  return { rules: emitter.rules, warnings: emitter.warnings };
}
