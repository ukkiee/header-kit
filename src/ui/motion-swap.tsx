import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { LABEL_SWAP_S } from './motion-tokens';

/**
 * 라벨 교체 전환 (ADR 0012) — 같은 자리의 문구가 바뀐 것을 짧은 fade로 알린다.
 * 삭제 2단 확인이 쓴다: '삭제' → '삭제?'로 넘어간 것이 단계 이동임을 인지시킨다.
 *
 * 자식 문자열이 곧 key라 문구가 바뀔 때만 재생된다. `mode="wait"`로 이전 라벨이 빠진
 * 뒤 새 라벨이 들어와 두 문구가 겹쳐 보이지 않는다. reduced-motion이면 즉시 교체한다 —
 * 전환 없이 같은 정보를 얻는다(스펙의 관측 계약).
 */
export function MotionSwap({ children }: { children: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className="inline-block">{children}</span>;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.span
        key={children}
        initial={{ opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 3 }}
        transition={{ duration: LABEL_SWAP_S }}
        className="inline-block"
      >
        {children}
      </m.span>
    </AnimatePresence>
  );
}
