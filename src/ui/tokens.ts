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

/** 떠 있는 팝업 표면 — Menu / Select / Autocomplete 팝업이 공유한다 (보더+명도, 무그림자). */
export const popupSurface =
  'rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900';

/** 팝업 항목 — Menu / Select / Autocomplete 항목이 공유한다 (하이라이트는 data-highlighted). */
export const popupItem =
  'flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs outline-none select-none data-[highlighted]:bg-zinc-100 dark:data-[highlighted]:bg-zinc-800';

/** 팝업 포지셔너 — 앵커에 붙는 떠 있는 레이어. Select / Autocomplete 가 공유한다. */
export const popupPositioner = 'z-50 outline-none';

/** 앵커 폭 이상으로 열리는 팝업 — 트리거보다 좁아 보이지 않게 한다. Select / Autocomplete 공유. */
export const popupAnchored = `min-w-[var(--anchor-width)] outline-none ${popupSurface}`;

/** 본문 색이 붙은 팝업 항목 — 값 목록(Select / Autocomplete)이 공유한다. */
export const popupItemText = `text-zinc-700 dark:text-zinc-200 ${popupItem}`;

/** 툴팁 표면 — 반전 명도(라이트에서 어두운 배경). IconButton 계열이 공유한다. */
export const tooltipPopup =
  'rounded-md bg-zinc-900 px-2 py-1 text-[11px] text-white dark:bg-zinc-100 dark:text-zinc-900';

/** 앱 캔버스(본문 배경+글자색) — App main / Storybook 프리뷰 래퍼가 공유한다. */
export const canvas = 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100';

/** 마이크로 캡션(종류 라벨 등) — KindLabel이 쓴다. */
export const microCaption = 'text-[10px] font-medium uppercase tracking-wide text-zinc-400';

/** 작은 배지 알약 — 규칙 종류 배지·조건 배지가 색만 달리해 공유한다. */
export const badgePill = 'rounded px-1 py-px text-[10px] font-medium';

/**
 * 스크롤바 트랙 — ScrollArea가 쓴다. 스크롤바는 오버레이라 콘텐츠 폭을 잠식하지 않는다
 * (팝업이 760×580 고정이라 폭을 뺏기면 곧바로 좁아진다, ADR 0005).
 *
 * 기본이 투명이 아니라 opacity-60인 이유 — Base UI는 스크롤 불가일 때 스크롤바를 DOM에서
 * 아예 뺀다(keepMounted 기본 false). 즉 이 트랙이 보인다는 것 자체가 "넘치는 내용이 있다"는
 * 신호라, 숨겨 두면 스크롤 가능하다는 어포던스를 잃는다. 호버·스크롤 중에만 진해진다.
 */
export const scrollbarTrack =
  'flex w-1.5 justify-center rounded-full opacity-60 transition-opacity duration-150 data-[hovering]:opacity-100 data-[scrolling]:opacity-100';

/** 스크롤바 썸 — 트랙과 짝. 다크 모드에서 명도가 뒤집힌다. */
export const scrollbarThumb = 'w-full rounded-full bg-zinc-300 dark:bg-zinc-600';

/**
 * 고정 폭 셀렉트 트리거 — 선택한 값에 따라 폭이 변하지 않아야 하는 자리에 쓴다.
 * 값이 8.5rem(136px)인 근거: 가장 긴 라벨은 매치 방식의 en `Regex (advanced)`로,
 * 라벨 폭 102px + 아이콘 12px + 간격 4px + 좌우 패딩 12px ≈ 130px이 필요하다(실측
 * 자연 폭 132px). 여유 4px을 얹었다. 라벨이 길어지면 폭보다 en/ko 미절단 스모크
 * 단언이 먼저 깨져 알려 준다.
 */
export const selectFixedWidth = 'w-[8.5rem]';

/** 키보드 포커스 링 — Button·SwitcherChip·사이드바 그립이 공유한다(offset 일관). */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500';
