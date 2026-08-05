/**
 * 만료 시각(expiresAt, epoch ms) 표기 — 폼의 datetime-local 입력이 쓴다.
 *
 * 목록 배지용 `formatExpiryBadge`는 티켓 05에서 걷었다: 자동 해제 시각이 ADR 0017에서
 * 퇴역해 행이 그 배지를 그리지 않고, 남겨 두면 아무도 부르지 않는 표기 규칙이 된다.
 * 남은 둘도 티켓 06이 폼에서 그 입력을 없앨 때 함께 사라진다.
 */

/** datetime-local 입력값 `YYYY-MM-DDTHH:MM` (local wall-clock). 미설정이면 빈 문자열. */
export function epochToLocalInput(ms: number | undefined): string {
  if (ms === undefined || ms <= 0) return '';
  const date = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

/** datetime-local 입력값 → epoch ms. 유효하지 않으면 undefined. */
export function localInputToEpoch(value: string): number | undefined {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) || ms <= 0 ? undefined : ms;
}
