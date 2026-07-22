import { m, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * 레일 화면 전환 fade-in (ui-refine 08) — 화면이 바뀌었음을 짧은 fade로 알린다.
 * viewKey(화면 이름)가 바뀌면 새 화면이 remount되며 fade-in한다(exit 대기 없음 — 즉시
 * 표시라 스냅하다). reduced-motion이면 애니메이션 없이 즉시 표시.
 */
export function MotionView({ viewKey, children }: { viewKey: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className="flex flex-col gap-3">{children}</div>;
  return (
    <m.div
      key={viewKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12 }}
      className="flex flex-col gap-3"
    >
      {children}
    </m.div>
  );
}
