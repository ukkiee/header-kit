/**
 * 디자인 시스템 공유 클래스 조각 — 프리미티브들이 색·표면 토큰을 한 곳에서 참조한다.
 * 테마 변경(예: accent 색, 필드 표면)은 이 파일만 고치면 전 프리미티브에 반영된다.
 */

/** 실선 필드 표면 — Input.solid / Select.bordered 가 공유한다. */
export const fieldSolid = 'border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900';

/** 필드 포커스 — Input / Select 가 공유한다. */
export const fieldFocus = 'outline-none focus:border-blue-500';

/** ghost 상호작용 표면 — Button.ghost / Select.ghost 가 공유한다. */
export const ghostInteractive =
  'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800';

/**
 * accent 배경 조각 — Button.primary / Chip.active 가 클래스 문자열로 재사용한다.
 * accent의 실제 단일 출처는 global css의 @theme(`--color-blue-600`)다 — Checkbox의
 * `accent-blue-600`, ToggleSwitch의 `data-[checked]:bg-blue-600`도 그 토큰을 통해 테마된다.
 */
export const accentBg = 'bg-blue-600';

/** 앱 캔버스(본문 배경+글자색) — App main / Storybook 프리뷰 래퍼가 공유한다. */
export const canvas = 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100';
