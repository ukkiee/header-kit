/**
 * 만료 시각(expiresAt, epoch ms) 표기의 단일 출처 — 폼의 datetime-local 값과
 * 목록 배지가 같은 local wall-clock을 쓰게 한다 (표기가 갈라지지 않도록).
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

/** 목록 배지용 표기 `YYYY-MM-DD HH:MM` — 폼 값과 같은 계산에서 파생(구분자만 다름). */
export function formatExpiryBadge(ms: number): string {
  return epochToLocalInput(ms).replace('T', ' ');
}
