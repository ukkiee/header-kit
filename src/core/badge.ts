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
 * 배지가 세는 것은 **지금 실제로 걸려 있는 규칙 수**다 (티켓 06, ADR 0015). 설정의 라벨이
 * "적용 중인 규칙 수"이므로 값도 그것이어야 한다 — 저장된 규칙 수나 활성 프로필 수를 보여
 * 주면 라벨과 값이 어긋난다. 그래서 입력은 저장 상태가 아니라 **재조정이 실제로 적용한
 * 그 결과의 요약**이다: quota·컴파일로 빠진 규칙은 애초에 여기 세어져 있지 않다.
 *
 * 적용 자체가 실패했으면(applyError) 걸린 규칙이 없다 — 요약이 든 수는 "걸리려 했던" 수라
 * 그대로 보여주면 배지가 거짓말을 한다.
 */
export function computeBadge(summary: StatusSummary, visible: boolean): BadgeSpec {
  // 표시 토글은 표시 여부만 정한다 — 꺼져 있으면 일시정지 표시도 나가지 않는다.
  if (!visible) return HIDDEN;
  if (summary.paused) return { text: 'II', color: PAUSED_COLOR };

  const applied = summary.applyError === null ? summary.ruleCount : 0;
  if (applied === 0) return HIDDEN;
  return { text: String(applied), color: APPLIED_COLOR };
}
