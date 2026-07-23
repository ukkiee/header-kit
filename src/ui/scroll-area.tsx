import { ScrollArea as BaseScrollArea } from '@base-ui-components/react/scroll-area';
import type { ReactNode } from 'react';
import { scrollbarThumb, scrollbarTrack } from './tokens';

/**
 * 스크롤 영역 — Base UI ScrollArea 기반 (ADR 0011). OS 기본 스크롤바 대신 앱 토큰으로
 * 그린 오버레이 스크롤바를 쓴다(다크 모드 포함). 스크롤바가 떠 있으므로 콘텐츠 폭을
 * 잠식하지 않는다 — 팝업이 760×580 고정(ADR 0005)이라 이 성질이 중요하다.
 *
 * **`ScrollArea.Content`는 의도적으로 쓰지 않는다.** 그 파트는 `min-width: fit-content`를
 * 걸어 내용이 넓으면 가로로 늘리는데, 이 앱의 계약은 정반대다 — 긴 프로필 이름은 잘리고
 * 레이아웃은 유지된다. children을 Viewport에 직접 둬 그 성질을 들이지 않는다.
 *
 * 가로 스크롤바도 두지 않는다. 이 앱에 의도된 가로 스크롤 표면은 없고, 생기면 그것은
 * 레이아웃 결함이므로 숨은 스크롤로 흡수하지 않고 진단(ui-diag)이 실패로 잡는다.
 */
export interface ScrollAreaProps {
  /** 바깥 컨테이너 — 크기·보더 등 장식. 스크롤 박스가 아니다. */
  className?: string;
  /** 스크롤 박스 — 패딩과 내부 레이아웃은 여기에 준다. */
  viewportClassName?: string;
  children: ReactNode;
}

export function ScrollArea({ className, viewportClassName, children }: ScrollAreaProps) {
  return (
    <BaseScrollArea.Root className={`min-h-0 ${className ?? ''}`}>
      <BaseScrollArea.Viewport className={`size-full ${viewportClassName ?? ''}`}>
        {children}
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar orientation="vertical" className={scrollbarTrack}>
        <BaseScrollArea.Thumb className={scrollbarThumb} />
      </BaseScrollArea.Scrollbar>
    </BaseScrollArea.Root>
  );
}
