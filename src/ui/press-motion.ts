import { useReducedMotion } from 'motion/react';
import type { ButtonHTMLAttributes } from 'react';

/** 누름·호버 spring — 좁은 팝업(760×580)에서 과하지 않게, 그러나 분명히 보이는 폭. */
const PRESS_SPRING = { type: 'spring', stiffness: 420, damping: 26, mass: 0.6 } as const;
const HOVER_SCALE = 1.02;
const TAP_SCALE = 0.95;

/**
 * motion 버튼의 공개 속성 — motion이 **자기 의미로 재정의하는** 핸들러만 걷어낸다.
 * `onAnimationStart`는 AnimationDefinition을, `onDrag*`는 제스처 정보를 받으므로 DOM
 * 시그니처와 충돌한다. `onAnimationEnd`·`onAnimationIteration`은 motion이 건드리지
 * 않으므로 남긴다. 프리미티브들이 같은 Omit을 반복하지 않도록 여기 둔다.
 */
export type MotionButtonAttributes = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'
>;

/**
 * 누름·호버 마이크로 인터랙션 (ADR 0012) — Button·IconButton·SwitcherChip·메뉴 항목이
 * 공유한다. 넷이 각자 reduced-motion 분기를 반복하지 않도록 여기 한 곳에 둔다.
 *
 * **reduced-motion이면 애니메이션 prop을 아예 돌려주지 않는다.** 지속시간 0짜리 전이로
 * 대체하지 않는 이유는, motion이 인라인 스타일을 쓰지 않아야 "모션 없음"이 계산 스타일로
 * 관측되기 때문이다(스펙의 reduced-motion 관측 계약, smoke N21b). 약하게 움직이는 것과
 * 움직이지 않는 것은 다르고, 여기서 지키려는 것은 후자다.
 *
 * **비활성 컨트롤에서도 돌려주지 않는다.** 눌리지 않는 것이 눌린 척하면 거짓 어포던스다.
 * CSS `active:scale-95`는 disabled에서 애초에 발동하지 않았는데 motion의 제스처는
 * `disabled` 속성을 읽지 않으므로, 그 성질을 여기서 명시적으로 이어 준다
 * (Button만 `disabled:pointer-events-none`을 갖고 있어 나머지는 무방비였다).
 */
export function usePressMotion(disabled?: boolean) {
  const reduce = useReducedMotion();
  if (reduce || disabled) return {};
  return {
    whileHover: { scale: HOVER_SCALE },
    whileTap: { scale: TAP_SCALE },
    transition: PRESS_SPRING,
  };
}
