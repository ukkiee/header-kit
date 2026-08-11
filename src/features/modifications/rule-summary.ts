import type { MessageKey, Translator } from '@/core/i18n';
import { foldResourceTypes, RESOURCE_GROUP_LABELS } from '@/core/resource-groups';
import {
  assembleSetCookie,
  isRawSetCookie,
  type Modification,
  type ModificationKind,
  type RuleConditions,
} from '@/core/schema';

/**
 * 규칙의 읽기 요약 (ADR 0006, ADR 0017) — 목록은 이걸로만 그린다.
 *
 * 티켓 05에서 **한 줄 요약 문자열이 칩 줄로** 바뀌었다. 예전 계약은 `스코프 → 효과` 한
 * 문자열이었고 조건은 따로 배지 줄이었는데, 시안의 둘째 줄은 스코프 칩으로 시작해
 * 효과·리소스 묶음·요청 메서드 칩으로 이어진다. 문자열 하나를 잘라 그리는 대신 여기서
 * 칩 목록으로 내면, 어디를 어떻게 줄바꿈할지는 그리는 쪽이 정할 수 있다.
 *
 * 배지는 프로토콜 성격의 기술 토큰(REQ/RES/COOKIE…)이라 지역화하지 않고, 모드·빈 값·리소스
 * 묶음 같은 의미 표기는 카탈로그를 거친다.
 */
export interface RuleView {
  /** 표시 제목 — 메모, 없으면 **종류 이름** (story 10). */
  title: string;
  badge: 'REQ' | 'RES' | 'COOKIE' | 'SET-COOKIE' | 'REDIRECT' | 'UA' | 'DEL' | 'BLOCK';
  /** 둘째 줄 맨 앞 — 이 규칙이 어디에 걸리는가 (story 13). */
  scope: ScopeChip;
  /** 스코프 뒤로 이어지는 칩 — 효과 · (응답 쿠키 속성) · 리소스 묶음 · 요청 메서드 순. */
  chips: string[];
}

/** 스코프 칩 — `regex`면 그리는 쪽이 정규식 표시를 붙인다 (story 16). */
export interface ScopeChip {
  label: string;
  regex: boolean;
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
  block: 'BLOCK',
};

/**
 * 종류 → 카탈로그 키. 행 제목과 폼의 종류 선택이 **같은 이름**을 써야 하므로 한 곳에 둔다 —
 * 예전에는 폼 컴포넌트 안에만 있어서 행이 종류 이름을 말하려면 표가 둘이 될 참이었다.
 */
export const KIND_LABELS: Record<ModificationKind, MessageKey> = {
  'request-header': 'kindRequestHeader',
  'response-header': 'kindResponseHeader',
  cookie: 'modCookie',
  'set-cookie': 'modSetCookie',
  redirect: 'modRedirect',
  'user-agent': 'kindUserAgent',
  'header-removal': 'kindHeaderRemoval',
  block: 'kindBlock',
};

export function ruleView(m: Modification, t: Translator): RuleView {
  return {
    title: m.comment || t(KIND_LABELS[m.kind]),
    badge: BADGES[m.kind],
    scope: scopeChip(m, t),
    chips: [...effectChips(m, t), ...conditionChips(m.conditions, t)],
  };
}

/**
 * 규칙의 **실효** URL 스코프 (ADR 0007).
 *
 * 필터가 비었을 때 아무것도 그리지 않던 것을 "모든 URL"로 바꾼 것이 티켓 04의 요점이었고,
 * 칩이 된 뒤에도 그대로다 — 빈칸은 "스코프가 없다"와 "아직 안 봤다"를 구별해 주지 않는데,
 * 요청을 통째로 없애는 Block에서는 그 차이가 페이지가 깨지는지 아닌지를 가른다.
 *
 * **매치 방식이 없으면 정규식이다** (ADR 0008의 하위 호환). 표시를 안 붙이면 화면이
 * 와일드카드라고 말하는데 실제로는 정규식으로 매칭되어, 안 걸리는 이유를 알 길이 없어진다.
 */
function scopeChip(m: Modification, t: Translator): ScopeChip {
  // Redirect는 자기 pattern이 곧 스코프다 — 스코프 칩에 두고 효과 칩은 목적지를 든다.
  if (m.kind === 'redirect') return { label: m.pattern || '…', regex: true };
  const filter = ('urlFilter' in m ? m.urlFilter?.trim() : '') ?? '';
  if (filter === '') return { label: t('scopeAllUrls'), regex: false };
  return { label: filter, regex: m.urlMatchType === undefined || m.urlMatchType === 'regex' };
}

/** 이 규칙이 무엇을 하는가 — 종류마다 읽을 거리가 다르다. */
function effectChips(m: Modification, t: Translator): string[] {
  if (m.kind === 'redirect') return [`→ ${m.substitution || '…'}`];

  // 효과는 뱃지(BLOCK)와 스코프가 이미 전부 말한다 — 더 붙이면 같은 말을 두 번 한다.
  if (m.kind === 'block') return [];

  if (m.kind === 'user-agent') return [m.value || t('emptyMarker')];

  /*
   * Header Removal은 **지울 이름과 방향을 둘 다** 말한다. 제목이 종류 이름이 되면서 헤더
   * 이름이 제목 자리를 잃었으므로, 효과 칩이 그것을 받지 않으면 행에서 무엇이 지워지는지
   * 읽을 수 없다. 양쪽에서 지운다는 것은 이 종류의 특징이라 함께 남긴다.
   */
  if (m.kind === 'header-removal') {
    return [m.name || t('emptyMarker'), t('removeBothSides')];
  }

  if (m.kind === 'set-cookie') {
    /*
     * 가를 수 없어 **원시로 보존된** 항목은 그 줄이 그대로 효과다 (ADR 0017). 속성 칩이
     * 붙지 않는 것이 정확하다 — 갈라 두지 않았으므로 어느 속성이 있는지 이 버전은 모른다.
     */
    if (isRawSetCookie(m)) return [m.raw === '' ? emptyEffect(m, t) : m.raw];
    /*
     * 구조화된 항목은 **실제로 나가는 줄을 그대로 갈라** 칩으로 만든다. 세그먼트 문법을
     * 여기서 다시 쓰면 조립과 갈라져 행이 보여 주는 것과 서버가 받는 것이 달라진다 —
     * 비운 속성이 붙지 않는 것도(story 35) 조립이 이미 지키는 규칙이라 공짜로 따라온다.
     *
     * 빈 조건은 컴파일과 **같은 술어**를 쓴다: 이름도 값도 비면 조립하지 않는다. 조립하면
     * `=` 한 글자가 되어 "빈 쿠키를 심는" 다른 규칙이 되고, 행은 그 `=`를 효과라고 말하게 된다.
     */
    const line = m.name.trim() === '' && m.value === '' ? '' : assembleSetCookie(m);
    return line === '' ? [emptyEffect(m, t)] : line.split('; ');
  }

  // 헤더 계열(요청·응답 헤더, 요청 쿠키) — `이름: 값`.
  const appendMark = m.mode === 'append' ? ` (${t('append')})` : '';
  const value = m.value === '' ? emptyEffect(m, t) : `${m.value}${appendMark}`;
  return [m.name ? `${m.name}: ${value}` : value];
}

/** 빈 값의 뜻 — 제거인지 빈 값 전송인지가 실제로 나가는 것을 가른다. */
function emptyEffect(m: { emptyMeans: 'remove' | 'send-empty' }, t: Translator): string {
  return `(${t(m.emptyMeans === 'remove' ? 'remove' : 'sendEmpty')})`;
}

/**
 * 조건 칩 — **리소스 묶음과 요청 메서드 둘뿐이다** (ADR 0017).
 *
 * 예전의 조건 배지 개념(제외 도메인의 부정 접두 `~`, 만료 시계 아이콘)은 그 조건들이 퇴역하며
 * 함께 사라졌다. 리소스 종류는 저장된 브라우저 값 그대로가 아니라 **여덟 묶음의 이름으로
 * 접어서** 낸다 — 폼이 여덟 칩으로 고르게 해 놓고 행이 `main_frame`을 그리면 같은 것을 두
 * 어휘로 말하게 된다.
 */
function conditionChips(conditions: RuleConditions | undefined, t: Translator): string[] {
  if (!conditions) return [];
  return [
    ...foldResourceTypes(conditions.resourceTypes ?? []).map((group) => t(RESOURCE_GROUP_LABELS[group])),
    ...(conditions.requestMethods ?? []).map((method) => method.toUpperCase()),
  ];
}
