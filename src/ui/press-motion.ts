import { useReducedMotion } from 'motion/react';
import type { ButtonHTMLAttributes } from 'react';

/**
 * motion 버튼의 공개 속성 — DOM과 이름이 겹치는 핸들러를 걷어낸다.
 * motion은 `onAnimationStart`·`onDrag*`를 자기 의미(AnimationDefinition 등)로 재정의하므로
 * DOM 시그니처와 충돌한다. 세 프리미티브가 같은 Omit을 반복하지 않도록 여기 둔다.
 * 이 앱의 버튼은 이 핸들러들을 쓰지 않는다.
 */
export type MotionButtonAttributes = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration' | 'onDrag' | 'onDragStart' | 'onDragEnd'
>;

/**
 * 누름·호버 마이크로 인터랙션 (ADR 0012) — Button·IconButton·SwitcherChip이 공유한다.
 * 세 프리미티브가 각자 reduced-motion 분기를 반복하지 않도록 여기 한 곳에 둔다.
 *
 * **reduced-motion이면 애니메이션 prop을 아예 돌려주지 않는다.** 지속시간 0짜리 전이로
 * 대체하지 않는 이유는, motion이 인라인 스타일을 쓰지 않아야 "모션 없음"이 계산 스타일로
 * 관측되기 때문이다(스펙의 reduced-motion 관측 계약, smoke N21). 약하게 움직이는 것과
 * 움직이지 않는 것은 다르고, 여기서 지키려는 것은 후자다.
 */
const PRESS_SPRING = { type: 'spring', stiffness: 420, damping: 26, mass: 0.6 } as const;

/** 호버·누름 배율 — 좁은 팝업(760×580)에서 과하지 않게, 그러나 분명히 보이는 폭. */
const HOVER_SCALE = 1.02;
const TAP_SCALE = 0.95;

export interface PressMotionProps {
  whileHover?: { scale: number };
  whileTap?: { scale: number };
  transition?: typeof PRESS_SPRING;
}

export function usePressMotion(): PressMotionProps {
  const reduce = useReducedMotion();
  if (reduce) return {};
  return {
    whileHover: { scale: HOVER_SCALE },
    whileTap: { scale: TAP_SCALE },
    transition: PRESS_SPRING,
  };
}
