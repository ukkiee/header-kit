import { format, type Translator } from '@/core/i18n';
import type { StatusSummary } from '@/core/summary';

/**
 * 본문 헤더의 부제 — `5개 적용 규칙 · 2개 활성 프로필` (ADR 0017).
 *
 * 세는 것이 두 가지로 **다른 질문**이라 한 줄에 나란히 둔다: 규칙 수는 지금 브라우저에
 * 실제로 걸려 있는 수(재조정이 적용한 결과)이고, 프로필 수는 켜져 있는 프로필 수다.
 * 일시정지면 둘 다 0으로 떨어진다 — 요약을 만드는 쪽이 이미 그렇게 접어 준다.
 *
 * 수와 세는 단위를 카탈로그가 **함께** 들고 있는 이유는 붙는 자리가 언어마다 다르기
 * 때문이다 — 한국어는 수 뒤에 단위가 붙고 영어는 명사만 굴절한다. 코드에서 이어 붙이면
 * 그 차이가 카탈로그 밖으로 새어 한쪽 로케일에서만 어색해진다.
 *
 * **적용에 실패했으면 그 사실이 수보다 먼저다** (code-review). 걸리지 못한 규칙을 "적용
 * 규칙"이라 부르면 헤더가 조용히 거짓을 말한다 — 상태 요약 줄이 이미 같은 분기를 갖고 있고,
 * 헤더가 그 수를 가져오면서 분기까지 함께 와야 했다.
 */
export function statusCountsText(summary: StatusSummary, t: Translator): string {
  const rules = summary.applyError
    ? `${summary.ruleCount} ${t('rulesNotApplied')}`
    : format(t(summary.ruleCount === 1 ? 'countRule' : 'countRules'), {
        count: summary.ruleCount,
      });
  const profiles = format(t(summary.activeProfileCount === 1 ? 'countProfile' : 'countProfiles'), {
    count: summary.activeProfileCount,
  });
  return `${rules} · ${profiles}`;
}
