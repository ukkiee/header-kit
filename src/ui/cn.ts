import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 클래스 병합 — shadcn/ui 컴포넌트가 전제하는 `cn`. 뒤에 오는 클래스가 앞의 같은
 * 계열을 **대체**한다(twMerge). 이 저장소는 오랫동안 tailwind-merge 없이 cva 축
 * 분리로 같은 문제를 풀었으나(`button.tsx`의 radius/pad 축, `select.tsx`의 width 축),
 * shadcn 소스를 그대로 받아 쓰기로 하면서 그 전제를 채택한다.
 *
 * 축 분리를 없애지는 않는다 — 축은 "이 프리미티브가 허용하는 변형"을 타입으로
 * 못박는 장치이고, cn은 호출자가 예외적으로 던지는 className이 조용히 겹치지 않게
 * 하는 안전망이다. 둘은 대체 관계가 아니다.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
