import { LazyMotion } from 'motion/react';
import { useLayoutEffect, type ReactNode } from 'react';
import { PANEL_COLLAPSE_S, POPUP_FADE_S, POPUP_SPRING_EASE } from './motion-tokens';

/**
 * CSS가 소유하는 전이의 길이·곡선을 문서 루트에 변수로 올린다.
 *
 * **왜 필요한가.** 마운트를 Base UI가 소유하는 표면(Collapsible 패널, Select 팝업)은
 * motion으로 감쌀 수 없어 CSS 전이를 쓴다. 그런데 그 값을 컴포넌트에서 인라인 `style`로
 * 주면 Base UI가 자기 CSS 변수를 쓰면서 **덮어써 사라진다**(둘 다 실측). 그렇다고 Tailwind
 * 임의값에 숫자를 박으면 길이가 motion-tokens 밖에 하나 더 생겨, 토큰을 고쳐도 화면은
 * 안 바뀌는 상태가 된다.
 *
 * 그래서 루트에 한 번 올리고 클래스는 `duration-[var(--popup-fade)]`처럼 변수를 읽는다.
 * Portal로 body에 붙는 팝업도 루트를 상속하므로 앱 셸 밖에서도 값이 닿는다.
 *
 * `useLayoutEffect`는 첫 페인트 **전에** 돈다 — 변수 없는 프레임이 스치지 않는다.
 */
const CSS_MOTION_VARS: Record<string, string> = {
  '--panel-collapse': `${PANEL_COLLAPSE_S}s`,
  '--popup-fade': `${POPUP_FADE_S}s`,
  '--popup-ease': POPUP_SPRING_EASE,
};

/**
 * 앱 모션 프로바이더 (ui-refine 08, ADR 0011) — LazyMotion으로 `m` 컴포넌트의
 * 애니메이션 기능을 동적 import로 지연 로드해 초기 번들을 억제한다. reduced-motion은
 * 각 애니메이션이 useReducedMotion으로 존중한다. 드래그 애니메이션은 dnd-kit이
 * 담당하므로(ADR 0011) motion과 이중 적용하지 않는다.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    for (const [name, value] of Object.entries(CSS_MOTION_VARS)) {
      document.documentElement.style.setProperty(name, value);
    }
  }, []);

  return (
    <LazyMotion features={() => import('./motion').then((m) => m.default)} strict>
      {children}
    </LazyMotion>
  );
}
