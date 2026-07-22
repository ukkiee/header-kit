import { isRuleExpired } from './expiry';
import { hasPlaceholders } from './placeholder';
import type { HeaderMode, Modification, Profile, RuleConditions, UrlMatchType } from './schema';
import { placeholderTemplate } from './schema';

/** 값·mode를 가진 Modification 종류 (header/cookie/set-cookie). */
type ValueModification = Extract<Modification, { mode: HeaderMode }>;
import type { CompileWarning } from './compile-warnings';
import {
  ALL_RESOURCE_TYPES,
  isRequestAppendAllowed,
  type HeaderInfo,
  type NetRule,
} from './rules';

/** 탭 상태 스냅샷 — 어댑터가 tabs API에서 만들어 env로 주입한다. */
export interface TabInfo {
  tabId: number;
  url?: string;
}

export interface CompileEnv {
  paused: boolean;
  /** 열린 탭 스냅샷 — 규칙 tabDomains 조건의 전개에 쓰인다. */
  tabs: TabInfo[];
  /** 현재 시각(ms) — 규칙 자동 해제(expiresAt)의 방출 가드에 쓰인다. */
  now: number;
  /** Placeholder 실체화 구역 — Compile은 소비만 하고 절대 생성하지 않는다. */
  materialized: Record<string, string>;
}

export interface CompileResult {
  rules: NetRule[];
  warnings: CompileWarning[];
}

/**
 * regexFilter는 컴파일 후 2KB 미만이어야 한다. 컴파일 크기는 순수하게 측정할
 * 수 없으므로 보수적인 소스 길이 휴리스틱을 쓴다.
 */
export const REGEX_JOIN_LIMIT = 1500;

/** session rules 총량 한도 — 이슈 01 스모크에서 실측 확인(5,000에서 거부). */
const TOTAL_RULE_LIMIT = 5000;
/** regex 조건 규칙의 타입별 한도. */
const REGEX_RULE_LIMIT = 1000;

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
 * 규칙의 tabDomains 조건을 열린 탭으로 전개한다 (ADR 0010).
 * undefined = 조건 없음, 빈 배열 = 매칭 탭 없음(그 규칙은 방출되지 않는다).
 */
function expandTabDomains(conditions: RuleConditions | undefined, tabs: TabInfo[]): number[] | undefined {
  const domains = (conditions?.tabDomains ?? []).map((d) => d.trim()).filter((d) => d !== '');
  if (domains.length === 0) return undefined;
  return tabs
    .filter((t) => {
      const hostname = hostnameOf(t.url);
      return hostname !== null && domains.some((d) => domainMatches(hostname, d));
    })
    .map((t) => t.tabId);
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
    // 항목 단위 경고 — 어느 Modification이 빠졌는지 각각 알린다.
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

/**
 * 규칙의 conditions + URL 스코프를 DNR 조건으로 조립한다 (ADR 0010).
 * tabIds는 호출자가 전개해 넘긴다(빈 배열이면 애초에 방출하지 않으므로 여기 오지 않는다).
 */
function conditionFor(
  conditions: RuleConditions | undefined,
  scope: { regexFilter?: string; urlFilter?: string },
  tabIds: number[] | undefined,
): NetRule['condition'] {
  const initiatorDomains = (conditions?.initiatorDomains ?? [])
    .map((d) => d.trim())
    .filter((d) => d !== '');
  const excludedRequestDomains = (conditions?.excludedDomains ?? [])
    .map((d) => d.trim())
    .filter((d) => d !== '');
  return {
    ...(scope.regexFilter !== undefined ? { regexFilter: scope.regexFilter } : {}),
    ...(scope.urlFilter !== undefined ? { urlFilter: scope.urlFilter } : {}),
    resourceTypes:
      conditions?.resourceTypes && conditions.resourceTypes.length > 0
        ? conditions.resourceTypes
        : [...ALL_RESOURCE_TYPES],
    ...(conditions?.requestMethods && conditions.requestMethods.length > 0
      ? { requestMethods: conditions.requestMethods }
      : {}),
    ...(initiatorDomains.length > 0 ? { initiatorDomains } : {}),
    ...(excludedRequestDomains.length > 0 ? { excludedRequestDomains } : {}),
    ...(tabIds !== undefined ? { tabIds } : {}),
  };
}

/** Placeholder가 있으면 실체화 값을, 없으면 템플릿을 소비한다 (방어선 보증). */
function consumeValue(rawValue: string, id: string, emitter: Emitter): string {
  return hasPlaceholders(rawValue) ? emitter.materialized[id]! : rawValue;
}

interface HeaderPlan {
  isRequest: boolean;
  header: string;
  nameForWarning: string;
  userValue: string;
  composedValue: string;
}

function planHeaderish(modification: ValueModification, emitter: Emitter): HeaderPlan {
  const value = consumeValue(modification.value, modification.id, emitter);
  switch (modification.kind) {
    case 'request-header':
      return {
        isRequest: true,
        header: modification.name.trim(),
        nameForWarning: modification.name,
        userValue: modification.value,
        composedValue: value,
      };
    case 'response-header':
      return {
        isRequest: false,
        header: modification.name.trim(),
        nameForWarning: modification.name,
        userValue: modification.value,
        composedValue: value,
      };
    case 'cookie':
      return {
        isRequest: true,
        header: 'Cookie',
        nameForWarning: modification.name,
        userValue: modification.value,
        composedValue: `${modification.name.trim()}=${value}`,
      };
    case 'set-cookie':
      return {
        isRequest: false,
        header: 'Set-Cookie',
        // set-cookie는 고정 헤더라 이름이 빌 수 없다 — 빈 값 차단이 유효한 사용례.
        nameForWarning: 'Set-Cookie',
        userValue: modification.value,
        composedValue: value,
      };
  }
}

/** 규칙 자체 스코프의 컴파일 결과 — regex 또는 DNR 비정규식 urlFilter (ADR 0007/0008). */
type OwnScope =
  | undefined // 자체 필터 없음
  | null // 한도 초과 — 방출 금지(경고로 알림)
  | { regexFilter: string }
  | { urlFilter: string };

/**
 * 규칙 자체 URL 필터 (ADR 0007) — 매치 방식(ADR 0008): 부재/regex → regexFilter,
 * 나머지는 DNR 비정규식 문법으로 매핑되어 regex 규칙 한도를 소모하지 않는다.
 * 한도 초과면 방출 금지 — 스코프를 조용히 넓히지 않는다.
 */
function ownScope(
  modification: { id: string; urlFilter?: string; urlMatchType?: UrlMatchType },
  profileId: string,
  emitter: Emitter,
): OwnScope {
  const pattern = modification.urlFilter?.trim() ?? '';
  if (pattern === '') return undefined;
  if (pattern.length > REGEX_JOIN_LIMIT) {
    emitter.warnings.push({
      code: 'regex-too-long',
      profileId,
      modificationId: modification.id,
      limit: REGEX_JOIN_LIMIT,
    });
    return null;
  }
  switch (modification.urlMatchType ?? 'regex') {
    case 'regex':
      return { regexFilter: pattern };
    case 'domain':
      return { urlFilter: `||${pattern}` };
    case 'prefix':
      return { urlFilter: `|${pattern}` };
    case 'contains':
      return { urlFilter: pattern };
  }
}

function emitModification(
  modification: Modification,
  priority: number,
  profileId: string,
  tabs: TabInfo[],
  emitter: Emitter,
): void {
  // 규칙 tabDomains 조건 — 매칭 탭이 없으면 이 규칙만 어디에도 적용되지 않는다.
  const tabIds = expandTabDomains(modification.conditions, tabs);
  if (tabIds !== undefined && tabIds.length === 0) return;

  switch (modification.kind) {
    case 'request-header':
    case 'response-header':
    case 'cookie':
    case 'set-cookie':
      emitHeaderRule(modification, priority, profileId, tabIds, emitter);
      return;
    case 'csp':
      emitCspRule(modification, priority, profileId, tabIds, emitter);
      return;
    case 'redirect':
      emitRedirectRule(modification, priority, profileId, tabIds, emitter);
      return;
    default:
      modification satisfies never;
  }
}

function emitHeaderRule(
  modification: ValueModification,
  priority: number,
  profileId: string,
  tabIds: number[] | undefined,
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
  const own = ownScope(modification, profileId, emitter);
  if (own === null) return;
  const info = resolveHeaderInfo(plan, modification, profileId, emitter);
  emitRule(
    emitter,
    {
      priority,
      action: {
        type: 'modifyHeaders',
        ...(plan.isRequest ? { requestHeaders: [info] } : { responseHeaders: [info] }),
      },
      condition: conditionFor(modification.conditions, own ?? {}, tabIds),
    },
    { profileId, modificationId: modification.id },
  );
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
  tabIds: number[] | undefined,
  emitter: Emitter,
): void {
  const value = modification.directives
    .map((d) => `${d.name.trim()} ${d.value.trim()}`.trim())
    .filter((d) => d !== '')
    .join('; ');
  if (value === '') return; // 빈 CSP는 규칙을 만들지 않는다

  const own = ownScope(modification, profileId, emitter);
  if (own === null) return;
  emitRule(
    emitter,
    {
      priority,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [{ header: 'Content-Security-Policy', operation: 'set', value }],
      },
      condition: conditionFor(modification.conditions, own ?? {}, tabIds),
    },
    { profileId, modificationId: modification.id },
  );
}

function emitRedirectRule(
  modification: Extract<Modification, { kind: 'redirect' }>,
  priority: number,
  profileId: string,
  tabIds: number[] | undefined,
  emitter: Emitter,
): void {
  const pattern = modification.pattern.trim();
  if (pattern === '') return; // 매칭 패턴이 없으면 규칙 없음

  // redirect는 자기 pattern이 regexFilter — 나머지 conditions는 그대로 조립한다.
  emitRule(
    emitter,
    {
      priority,
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: modification.substitution },
      },
      condition: conditionFor(modification.conditions, { regexFilter: pattern }, tabIds),
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
 * 더 높은 priority를 받는다. 조건은 규칙의 속성이다 (ADR 0010) — 각 규칙의
 * conditions가 자기 DNR 조건으로 직접 내려간다.
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
  const active = profiles.filter((p) => p.active);

  // 방출 대상: enabled이고 만료되지 않은 규칙 — 대역 폭도 이 기준으로 센다.
  const emittable = new Map<string, Modification[]>();
  for (const profile of active) {
    emittable.set(
      profile.id,
      profile.modifications.filter((m) => m.enabled && !isRuleExpired(m, now)),
    );
  }

  const bandBase = new Map<string, number>();
  let cursor = 1;
  for (let i = active.length - 1; i >= 0; i -= 1) {
    const profile = active[i]!;
    bandBase.set(profile.id, cursor);
    cursor += emittable.get(profile.id)!.length;
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

    const enabled = emittable.get(profile.id)!;
    const base = bandBase.get(profile.id)!;

    enabled.forEach((modification, index) => {
      emitModification(modification, base + enabled.length - 1 - index, profile.id, tabs, emitter);
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
