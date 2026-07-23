/**
 * 모션 타이밍의 단일 출처 (ADR 0012 — "앱 전체가 하나의 모션 언어").
 * 값이 컴포넌트마다 흩어져 있으면 언어가 아니라 우연의 일치가 된다.
 *
 * 이 파일은 런타임 의존성 없이 상수만 둔다 — 스모크(`scripts/smoke.mjs`)가 그대로
 * import해 관측 창을 잡기 때문이다(Node의 타입 스트리핑이 `as const`를 걷어낸다).
 * 테스트가 자기만의 숫자를 들고 있으면 값이 바뀌는 순간 조용히 어긋난다.
 */

/** 누름·호버 spring — press-motion. */
export const PRESS_SPRING = { type: 'spring', stiffness: 420, damping: 26, mass: 0.6 } as const;

/** 목록 행 enter/exit — MotionRow. */
export const ROW_TRANSITION = { duration: 0.18, ease: 'easeOut' } as const;

/** 레일 화면 전환 fade — MotionView. */
export const VIEW_TRANSITION = { duration: 0.12 } as const;

/** 메뉴 항목 순차 등장 — 항목 사이 간격과 각 항목의 fade 길이(초). */
export const MENU_ITEM_STAGGER_S = 0.05;
export const MENU_ITEM_FADE_S = 0.12;

/** 삭제 2단 확인 라벨 교체 — 짧게, 단계가 바뀐 것만 알린다. */
export const LABEL_SWAP_S = 0.12;

/**
 * 항목 n개가 전부 자리 잡기까지의 총 시간(ms). 마지막 항목은 `(n-1)`번째 간격이
 * 지난 뒤에야 fade를 시작한다. 스모크는 이 값으로 "아직 진행 중" 창을 잡는다.
 */
export function menuStaggerTotalMs(itemCount: number): number {
  const last = Math.max(itemCount - 1, 0);
  return Math.round((last * MENU_ITEM_STAGGER_S + MENU_ITEM_FADE_S) * 1000);
}
