import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { ROW_TRANSITION } from './motion-tokens';

// 감도 판정도 여기서 함께 내보낸다 — 목록 모션을 쓰는 쪽이 "지금 전이가 도는가"를 물어야
// 할 때가 있고(빈 상태의 등장 시점), 그 답의 출처가 MotionRow와 갈리면 안 된다.
export { AnimatePresence, useReducedMotion };

/**
 * 목록 항목 enter/exit 모션 (ui-refine 08) — 추가는 fade+height-in, 삭제는 반대.
 * reduced-motion이면 애니메이션 없이 즉시 표시(높이/투명도 전이 생략). AnimatePresence
 * 자식으로 쓰며, key가 바뀌면 exit가 재생된다. `m`은 LazyMotion features 로드 전엔
 * 정적 렌더된다.
 */
export function MotionRow({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div>{children}</div>;
  return (
    <m.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={ROW_TRANSITION}
      style={{ overflow: 'hidden' }}
    >
      {children}
    </m.div>
  );
}
