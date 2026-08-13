import { cva, type VariantProps } from 'class-variance-authority';
import { m } from 'motion/react';
import { usePressMotion, type MotionButtonAttributes } from './press-motion';
import { focusRing } from './tokens';

/**
 * 스위처 항목 — 단일 선택 내비게이션 버튼(양 표면 사이드바, ADR 0005).
 * 토글 상태를 표현하는 Chip과 달리 "지금 보고 있는 것"의 선택을 표현한다.
 */
const switcherChip = cva(
  `flex w-full shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs whitespace-nowrap transition-colors ${focusRing}`,
  {
    variants: {
      /*
       * **이미 고른 것을 다시 고르는 것은 아무 일도 아니다** — 그래서 커서도 그렇게 말한다.
       *
       * 실측: 선택된 프로필 행의 칩을 눌러도 DOM도 저장소도 그대로다. 유일한 효과는 열려
       * 있던 규칙 폼이 닫히는 것인데, 그건 화면 반대쪽에서 일어나는 부수효과라 커서가
       * 예고할 수 있는 종류가 아니다. 그런데 그 칩이 행 폭 239px 중 125px(52%)를 포인터로
       * 덮고 있었다 — 사용자가 "아무 기능도 없는데 포인터가 나온다"고 짚은 자리다.
       *
       * 커서를 베이스에서 아예 빼지 않고 변형으로 내린 이유: Tailwind v4 preflight에는
       * 버튼 커서 규칙이 없어서(빌드 CSS에서 확인) 빼면 `＋ 새 프로필` 칩이 화살표가 된다.
       */
      selected: {
        true: 'cursor-default font-medium text-foreground',
        false: 'cursor-pointer text-muted-foreground',
      },
      /**
       * 면을 **자기가** 칠하는가.
       *
       * 기본은 참이다 — 혼자 서는 칩(＋ 새 프로필)은 자기 배경이 곧 선택 표시다. 거짓은
       * 칩이 더 큰 표면의 일부일 때다: 프로필 행은 칩 옆에 켬/끔 스위치가 함께 서고, 선택
       * 표시가 칩에만 칠해지면 스위치가 그 면 **밖에** 남아 한 행이 두 조각으로 보인다.
       * 그때는 행이 면을 들고 칩은 글자만 바꾼다.
       */
      filled: { true: '', false: '' },
    },
    compoundVariants: [
      { selected: true, filled: true, class: 'bg-secondary' },
      { selected: false, filled: true, class: 'hover:bg-accent' },
    ],
    defaultVariants: { selected: false, filled: true },
  },
);

export interface SwitcherChipProps extends MotionButtonAttributes, VariantProps<typeof switcherChip> {}

export function SwitcherChip({ selected, filled, className, type = 'button', ...props }: SwitcherChipProps) {
  /*
   * **면을 자기가 칠하지 않는 칩은 누름 모션도 쓰지 않는다.**
   *
   * `whileHover`의 1.02 배율이 칩 **안의 것들**을 1px 남짓 밀어내는데, 그 칩이 행의 일부일
   * 때는 그것이 곧 레이아웃 시프트로 읽힌다 — 실측: 이름 편집을 여는 순간(호버로 연다)
   * 1.02 칩이 배율 없는 편집 셸로 교체되며 컬러 사각형 x 106.93 → 108, 이름 123.25 → 124,
   * 셸 폭 125.46 → 123으로 스냅했다. 닫을 때는 반대로 흘렀다. 마우스를 대지 않고 키보드로
   * 열면 그 델타가 전부 0이었고, reduced-motion에서도 0이었다 — 원인을 그 배율로 고정한다.
   *
   * `filled={false}`는 "면을 행이 든다"는 뜻이고, 그 행은 이미 `hover:bg-accent`로 호버를
   * 말한다. 배율이 없어도 잃는 채널이 없다. 혼자 서는 칩(＋ 새 프로필)은 자기 면이 곧 표시라
   * 배율을 그대로 쓴다.
   */
  const press = usePressMotion(props.disabled || filled === false);
  return (
    <m.button
      type={type}
      aria-current={selected ? 'true' : undefined}
      className={switcherChip({ selected, filled, className })}
      {...press}
      {...props}
    />
  );
}
