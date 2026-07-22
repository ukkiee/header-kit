import { LazyMotion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * 앱 모션 프로바이더 (ui-refine 08, ADR 0011) — LazyMotion으로 `m` 컴포넌트의
 * 애니메이션 기능을 동적 import로 지연 로드해 초기 번들을 억제한다. reduced-motion은
 * 각 애니메이션이 useReducedMotion으로 존중한다. 드래그 애니메이션은 dnd-kit이
 * 담당하므로(ADR 0011) motion과 이중 적용하지 않는다.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={() => import('./motion').then((m) => m.default)} strict>
      {children}
    </LazyMotion>
  );
}
