import { m } from 'motion/react';
import type { ComponentProps } from 'react';
import { Button as ShadcnButton } from '@/ui/button';
import { usePressMotion } from './press-motion';

/**
 * 앱의 버튼 — shadcn Button에 **누름·호버 모션**을 얹는다. shadcn 소스(`button.tsx`)는
 * 손대지 않고 Base UI의 `render` 합성으로 motion 요소를 끼운다(ADR 0014).
 *
 * shadcn 기본은 `active:not-aria-[haspopup]:translate-y-px` — 1px 내려앉는 CSS 전이다.
 * 그것만 쓰면 **버튼만** 다른 감각이 된다: 이 앱의 다른 세 상호작용 표면(SwitcherChip,
 * IconButton, 메뉴 항목)은 전부 spring scale로 반응하고(ADR 0012), 스모크 N21b가 넷을
 * 한 자리에서 대조한다. 한 화면 안에서 버튼만 다르게 눌리는 것은 일관성 문제다
 * (ui-review UI-02).
 *
 * reduced-motion과 disabled 처리는 `usePressMotion`이 이미 집행한다 — 그때는 모션 prop을
 * 아예 돌려주지 않아 "움직이지 않음"이 계산 스타일로 관측된다(N21c의 계약).
 */
export type ButtonProps = ComponentProps<typeof ShadcnButton>;

export function Button({ disabled, ...props }: ButtonProps) {
  const press = usePressMotion(disabled);
  return <ShadcnButton render={<m.button {...press} />} disabled={disabled} {...props} />;
}

export { buttonVariants } from '@/ui/button';
