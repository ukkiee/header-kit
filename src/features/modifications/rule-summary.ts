import type { Translator } from '@/core/i18n';
import type { Modification, ModificationKind, RuleConditions } from '@/core/schema';
import { formatExpiryBadge } from './expiry-format';

/**
 * 규칙의 읽기 요약 (ADR 0006) — 목록은 이걸로만 그린다. 배지는 프로토콜 성격의
 * 기술 토큰(REQ/RES/COOKIE…)이라 지역화하지 않고, 모드·빈 값 같은 의미 표기는
 * 카탈로그를 거친다.
 */
export interface RuleView {
  /** 표시 제목 — 메모 우선, 없으면 대표 필드(헤더/쿠키 이름), 그것도 없으면 배지. */
  title: string;
  badge: 'REQ' | 'RES' | 'COOKIE' | 'SET-COOKIE' | 'REDIRECT' | 'UA' | 'DEL';
  /** 한 줄 효과 요약 (mono 렌더 가정). */
  summary: string;
  /** 조건 배지 줄 (ADR 0010, ui-refine 05) — 없으면 빈 배열이라 행 높이가 불변. */
  conditionBadges: ConditionBadge[];
}

/** 조건 배지 하나 — tone은 제외(부정) 방향을, icon은 만료 시계를 나타낸다. */
export interface ConditionBadge {
  label: string;
  tone: 'neutral' | 'exclude';
  icon?: 'clock';
}

/**
 * 종류 → 행 뱃지. `Record<ModificationKind, ...>`로 못박아 **종류를 더하면 여기서
 * 타입이 먼저 깨지게** 한다 — as const만 두면 키 누락이 런타임 undefined로 조용히 샌다.
 */
const BADGES: Record<ModificationKind, RuleView['badge']> = {
  'request-header': 'REQ',
  'response-header': 'RES',
  cookie: 'COOKIE',
  'set-cookie': 'SET-COOKIE',
  redirect: 'REDIRECT',
  'user-agent': 'UA',
  'header-removal': 'DEL',
};

/** 조건을 값 배지 목록으로 (ui-refine 05) — 차원이 구별되는 표기. */
export function conditionBadges(conditions: RuleConditions | undefined): ConditionBadge[] {
  if (!conditions) return [];
  const badges: ConditionBadge[] = [];
  for (const method of conditions.requestMethods ?? []) {
    badges.push({ label: method.toUpperCase(), tone: 'neutral' });
  }
  for (const type of conditions.resourceTypes ?? []) {
    badges.push({ label: type, tone: 'neutral' });
  }
  for (const domain of conditions.initiatorDomains ?? []) {
    badges.push({ label: `@${domain}`, tone: 'neutral' });
  }
  for (const domain of conditions.tabDomains ?? []) {
    badges.push({ label: `tab:${domain}`, tone: 'neutral' });
  }
  // 제외 도메인은 부정 접두(~)와 exclude 톤으로 방향을 드러낸다.
  for (const domain of conditions.excludedDomains ?? []) {
    badges.push({ label: `~${domain}`, tone: 'exclude' });
  }
  if (conditions.expiresAt !== undefined && conditions.expiresAt > 0) {
    badges.push({ label: formatExpiryBadge(conditions.expiresAt), tone: 'neutral', icon: 'clock' });
  }
  return badges;
}

export function ruleView(m: Modification, t: Translator): RuleView {
  const view = bareView(m, t);
  // 규칙 자신의 URL 필터(ADR 0007)는 효과 앞에 붙는다 — `imtest.me/ → x-test: aaa`.
  const scope = 'urlFilter' in m ? m.urlFilter?.trim() : undefined;
  const summary = scope ? `${scope} → ${view.summary}` : view.summary;
  return { ...view, summary, conditionBadges: conditionBadges(m.conditions) };
}

/** 조건·스코프를 뺀 기본 뷰 — ruleView가 스코프·조건 배지를 얹는다. */
type BareView = Omit<RuleView, 'conditionBadges'>;

function bareView(m: Modification, t: Translator): BareView {
  const badge = BADGES[m.kind];

  if (m.kind === 'redirect') {
    const summary =
      m.pattern || m.substitution ? `${m.pattern || '^…'} → ${m.substitution || '…'}` : t('emptyMarker');
    return { title: m.comment || badge, badge, summary };
  }

  /*
   * 다른 행과 같은 문법으로 읽힌다 — **제목은 대상, 요약은 효과**
   * (예: `X-Frame-Options [RES] / X-Frame-Options: DENY`).
   * 뱃지가 이미 종류를 말하므로 제목·요약에서 종류 이름을 되풀이하지 않는다.
   */
  if (m.kind === 'user-agent') {
    // 대상은 고정 헤더, 효과는 보낼 UA 문자열이다.
    return { title: m.comment || t('kindUserAgent'), badge, summary: m.value || t('emptyMarker') };
  }

  if (m.kind === 'header-removal') {
    // 대상은 헤더 이름, 효과는 **양쪽에서** 지운다는 사실이다 — 그것이 이 종류의 특징이라
    // 이름을 되풀이하는 것보다 방향을 말해 주는 편이 읽는 사람에게 쓸모 있다.
    return { title: m.comment || m.name || badge, badge, summary: t('removeBothSides') };
  }

  // set-cookie는 이름 없이 원시 Set-Cookie 값 하나다.
  const name = 'name' in m ? m.name : '';
  const title = m.comment || name || badge;
  const empty = `(${t(m.emptyMeans === 'remove' ? 'remove' : 'sendEmpty')})`;
  const appendMark = m.mode === 'append' ? ` (${t('append')})` : '';
  const summary = name
    ? m.value === ''
      ? `${name}: ${empty}`
      : `${name}: ${m.value}${appendMark}`
    : m.value === ''
      ? empty
      : `${m.value}${appendMark}`;
  return { title, badge, summary };
}
