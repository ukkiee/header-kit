import type { StatusSummary } from './summary';

export interface BadgeSpec {
  text: string;
  color: string;
}

const PAUSED_COLOR = '#6b7280';
const APPLIED_COLOR = '#2563eb';

/** 아무것도 말하지 않는 배지 — 빈 텍스트면 툴바 아이콘에 배지가 그려지지 않는다. */
const HIDDEN: BadgeSpec = { text: '', color: PAUSED_COLOR };

/**
 * 툴바 배지 내용을 계산하는 순수 함수 — 어댑터는 결과를 그대로 반영만 한다.
 *
 * 배지가 세는 것은 **지금 실제로 걸려 있는 규칙 수**다
 * (티켓 06, `docs/reviews/wide-ui-redesign/spec.md` R-5). 설정의 라벨이
 * "적용 중인 규칙 수"이므로 값도 그것이어야 한다 — 저장된 규칙 수나 활성 프로필 수를 보여
 * 주면 라벨과 값이 어긋난다. 그래서 입력은 저장 상태가 아니라 **재조정이 실제로 적용한
 * 그 결과의 요약**이다: quota·컴파일로 빠진 규칙은 애초에 여기 세어져 있지 않다.
 *
 * 적용이 실패한 재조정에는 이 값을 쓰지 않는다 — `drawsBadge`를 먼저 보라.
 */
export function computeBadge(summary: StatusSummary, visible: boolean): BadgeSpec {
  // 표시 토글은 표시 여부만 정한다 — 꺼져 있으면 일시정지 표시도 나가지 않는다.
  if (!visible) return HIDDEN;
  if (summary.paused) return { text: 'II', color: PAUSED_COLOR };
  if (summary.ruleCount === 0) return HIDDEN;
  return { text: String(summary.ruleCount), color: APPLIED_COLOR };
}

/**
 * 이번 재조정 결과를 배지에 반영해야 하는가 — 아니면 직전 배지를 그대로 둘 것인가.
 *
 * 적용이 실패하면(`applyError`) 세션 규칙은 **하나도 바뀌지 않는다**:
 * `updateSessionRules`가 원자적이라 직전 규칙 세트가 그대로 걸려 있다. 그래서 그때
 * 실제 적용 수는 0이 아니라 직전 N이고, 직전 배지가 여전히 그 수를 말하고 있다. 다시
 * 그리면 브라우저에 N개가 걸린 채로 "적용 없음"(빈 배지)이나 "일시정지"를 주장하게 된다 —
 * 게다가 빈 배지는 활성 규칙이 없는 상태와 구분되지 않아 실패가 침묵이 된다.
 *
 * 표시를 끈 경우만 예외다: 토글은 표시 여부만 정하므로 실패 중에도 배지를 지운다.
 */
export function drawsBadge(summary: StatusSummary, visible: boolean): boolean {
  return !visible || summary.applyError === null;
}
