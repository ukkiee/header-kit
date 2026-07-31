import type { Translator } from '@/core/i18n';
import type { StatusSummary } from '@/core/summary';

/**
 * 본문 헤더의 부제 — `5 적용 규칙 · 2 활성 프로필` (ADR 0017).
 *
 * 세는 것이 두 가지로 **다른 질문**이라 한 줄에 나란히 둔다: 규칙 수는 지금 브라우저에
 * 실제로 걸려 있는 수(재조정이 적용한 결과)이고, 프로필 수는 켜져 있는 프로필 수다.
 * 일시정지면 둘 다 0으로 떨어진다 — 요약을 만드는 쪽이 이미 그렇게 접어 준다.
 *
 * 순수 문자열 함수인 이유는 이 문장이 화면 두 곳(팝업·탭)에서 같아야 하고, 단·복수 선택이
 * 로케일마다 다르기 때문이다. 컴포넌트 안에 두면 그 선택이 렌더 트리에 숨는다.
 */
export function statusCountsText(summary: StatusSummary, t: Translator): string {
  const rules = `${summary.ruleCount} ${t(summary.ruleCount === 1 ? 'activeRule' : 'activeRules')}`;
  const profiles = `${summary.activeProfileCount} ${t(
    summary.activeProfileCount === 1 ? 'activeProfile' : 'activeProfiles',
  )}`;
  return `${rules} · ${profiles}`;
}
