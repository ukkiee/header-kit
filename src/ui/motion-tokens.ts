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

/**
 * 목록 행 enter/exit — MotionRow. 규칙 폼의 저장·취소가 이 값으로 접힌다.
 * 0.18s는 동작이 끝난 것을 눈이 따라가기 전에 사라져 "툭 끊긴다"는 인상이었다.
 */
export const ROW_TRANSITION = { duration: 0.26, ease: 'easeOut' } as const;

/**
 * 접이식 패널 열림/닫힘 높이 전환 — CollapsiblePanel.
 * 목록 행보다 움직이는 양이 커서 같은 길이면 급하게 보인다.
 */
export const PANEL_COLLAPSE_S = 0.22;

/**
 * 떠 있는 팝업 열림/닫힘 — Select 팝업. 열릴 때 위에서 아래로 내려오고 닫힐 때 위로 접힌다.
 * 앵커에 붙어 나타나는 것이라 패널보다 짧지만, 아래 오버슈트가 보일 만큼은 준다.
 */
export const POPUP_FADE_S = 0.18;

/**
 * 팝업 열림 이징 — 끝에서 살짝 지나쳤다 돌아오는 spring 느낌의 CSS 곡선.
 *
 * 여기만 motion의 spring이 아니라 CSS인 이유는 팝업의 마운트를 Base UI가 소유하기
 * 때문이다(`collapsible-panel.tsx`와 같은 사정). 대신 곡선을 여기 한 곳에 둔다.
 * 닫힘에는 쓰지 않는다 — 사라지는 것이 되돌아오는 인상은 어색하다.
 */
export const POPUP_SPRING_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

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
