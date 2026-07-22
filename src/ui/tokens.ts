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
 * accent 배경 조각 — Button.primary / Checkbox.Indicator 가 클래스 문자열로
 * 재사용한다. accent의 실제 단일 출처는 global css의 @theme(`--color-blue-600`)다 —
 * ToggleSwitch의 `data-[checked]:bg-blue-600`, ChipGroup의 `data-[pressed]:bg-blue-600`도
 * 그 토큰을 통해 테마된다 (data 수식어는 문자열 조각과 합성 불가라 인라인 표기).
 */
export const accentBg = 'bg-blue-600';

/** 떠 있는 팝업 표면 — Menu.Popup / Select.Popup 이 공유한다 (보더+명도, 무그림자). */
export const popupSurface =
  'rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900';

/** 팝업 항목 — Menu.Item / Select.Item 이 공유한다 (하이라이트는 data-highlighted). */
export const popupItem =
  'flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs outline-none select-none data-[highlighted]:bg-zinc-100 dark:data-[highlighted]:bg-zinc-800';

/** 앱 캔버스(본문 배경+글자색) — App main / Storybook 프리뷰 래퍼가 공유한다. */
export const canvas = 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100';

/** 마이크로 캡션(종류 라벨 등) — KindLabel이 쓴다. */
export const microCaption = 'text-[10px] font-medium uppercase tracking-wide text-zinc-400';
