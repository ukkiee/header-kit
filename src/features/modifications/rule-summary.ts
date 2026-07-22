import type { Translator } from '@/core/i18n';
import type { Modification } from '@/core/schema';

/**
 * 규칙의 읽기 요약 (ADR 0006) — 목록은 이걸로만 그린다. 배지는 프로토콜 성격의
 * 기술 토큰(REQ/RES/CSP…)이라 지역화하지 않고, 모드·빈 값 같은 의미 표기는
 * 카탈로그를 거친다.
 */
export interface RuleView {
  /** 표시 제목 — 메모 우선, 없으면 대표 필드(헤더/쿠키 이름), 그것도 없으면 배지. */
  title: string;
  badge: 'REQ' | 'RES' | 'COOKIE' | 'SET-COOKIE' | 'CSP' | 'REDIRECT';
  /** 한 줄 효과 요약 (mono 렌더 가정). */
  summary: string;
}

const BADGES = {
  'request-header': 'REQ',
  'response-header': 'RES',
  cookie: 'COOKIE',
  'set-cookie': 'SET-COOKIE',
  csp: 'CSP',
  redirect: 'REDIRECT',
} as const;

export function ruleView(m: Modification, t: Translator): RuleView {
  const badge = BADGES[m.kind];

  if (m.kind === 'csp') {
    const summary = m.directives
      .map((d) => `${d.name} ${d.value}`.trim())
      .filter(Boolean)
      .join(' · ');
    return { title: m.comment || 'CSP', badge, summary: summary || t('emptyMarker') };
  }

  if (m.kind === 'redirect') {
    const summary =
      m.pattern || m.substitution ? `${m.pattern || '^…'} → ${m.substitution || '…'}` : t('emptyMarker');
    return { title: m.comment || badge, badge, summary };
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
