import { format, type MessageKey, type Translator } from '@/core/i18n';
import { PROFILE_STATE_KEY, type ProfileRowStatus, type StatusSummary } from '@/core/summary';

/** 이 파일의 문구들이 잇는 구분자 — 헤더 부제와 프로필 행 메타가 같은 모양으로 읽힌다. */
const DOT = ' · ';

/**
 * 수 하나를 세는 단위와 함께 낸다 — `5개 적용 규칙` · `3 rules`.
 *
 * 수와 단위를 카탈로그가 **함께** 드는 이유는 붙는 자리가 언어마다 다르기 때문이다 — 한국어는
 * 수 뒤에 단위가 붙고 영어는 명사만 굴절한다. 코드에서 이어 붙이면 그 차이가 카탈로그 밖으로
 * 새어 한쪽 로케일에서만 어색해진다. 단수/복수 선택도 카탈로그의 일이라 키를 둘 받는다.
 */
function counted(t: Translator, count: number, one: MessageKey, many: MessageKey): string {
  return format(t(count === 1 ? one : many), { count });
}

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
    : counted(t, summary.ruleCount, 'countRule', 'countRules');
  const profiles = counted(t, summary.activeProfileCount, 'countProfile', 'countProfiles');
  return `${rules}${DOT}${profiles}`;
}

/**
 * 프로필 행의 메타 — `3개 규칙 · 적용` (ADR 0017, 스펙 story 42).
 *
 * 헤더 부제와 같은 규약을 쓴다 — **같은 구분자(`DOT`)와 같은 수 세기(`counted`)를 부른다.**
 * 그래서 같은 파일에 있다: 나눠 두면 두 규약이 각자 복제되고, 한쪽만 고쳐진 날 같은 화면의
 * 두 줄이 다르게 읽힌다. 주석이 아니라 코드가 그 공유를 들고 있어야 한다 (code-review).
 *
 * 세는 수가 헤더 부제의 것과 **다른 질문의 답**인 것에 주의한다: 여기 수는 그 프로필의 켜진
 * 규칙 수이고, 부제의 수는 지금 브라우저에 실제로 걸려 있는 수다. 겹친 규칙은 컴파일에서
 * 하나로 접히므로 프로필별로 되돌려 귀속시킬 수 없다(`profileRowStatus` 주석).
 *
 * 상태 낱말은 행 접근성 이름이 쓰는 그 낱말이다(`PROFILE_STATE_KEY`) — 보이는 **상태 낱말**과
 * 이름의 그것이 같아야 음성 제어 사용자가 눈으로 읽은 그 말로 행을 부를 수 있다(WCAG 2.5.3).
 */
export function profileRowMetaText(status: ProfileRowStatus, t: Translator): string {
  const rules = counted(t, status.enabledModificationCount, 'profileRule', 'profileRules');
  return `${rules}${DOT}${t(PROFILE_STATE_KEY[status.state])}`;
}
