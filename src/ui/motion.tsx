import { domAnimation } from 'motion/react';

/**
 * LazyMotion features 번들 (ui-refine 08) — 동적 import로 코드 분할해 팝업 초기
 * 청크에서 뺀다. `m` 컴포넌트는 이 features가 로드되기 전엔 정적 렌더되고,
 * 로드 직후(보통 1프레임) 애니메이션이 활성화된다. 첫 페인트엔 애니메이션이 없으므로
 * 지연 로드가 체감을 해치지 않는다.
 */
export default domAnimation;
