import { cva, type VariantProps } from 'class-variance-authority';
import { m } from 'motion/react';
import { usePressMotion, type MotionButtonAttributes } from './press-motion';
import { focusRing } from './tokens';
import { accentBg, ghostInteractive } from './tokens';

// 누름·호버는 motion이 소유한다 (ADR 0012) — active:scale-95는 여기서 사라진다.
// 색 전이는 CSS가 계속 맡는다(transition-colors).
const button = cva(
  `inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap font-medium transition-[color,background-color,border-color,opacity] disabled:pointer-events-none disabled:opacity-50 ${focusRing}`,
  {
    variants: {
      variant: {
        primary: `${accentBg} text-white hover:bg-blue-500`,
        ghost: `bg-transparent ${ghostInteractive}`,
        danger: 'bg-transparent text-red-600 hover:bg-red-50 dark:hover:bg-red-950',
      },
      size: {
        sm: 'h-7 text-xs',
        md: 'h-9 text-sm',
      },
      /**
       * 모서리·좌우 여백을 `variant`/`size`에서 **떼어 낸 축**이다.
       *
       * 이 저장소는 className을 병합하지 않고 덧붙이므로(tailwind-merge 없음) 호출자가
       * `rounded-lg`나 `px-4`를 className으로 넘기면 두 클래스가 함께 남아 CSS 소스 순서가
       * 승자를 정한다 — 그래서 폭을 변형으로 다루는 Select와 같은 규율을 쓴다.
       *
       * 기본값(`default`)은 아무것도 내지 않고, 아래 compoundVariants가 예전과 **똑같은**
       * 클래스를 채운다(primary=pill, 나머지=rounded-md / sm=px-2, md=px-3). 명시적으로
       * 고른 값만 그 자리를 대체하므로 축을 하나 늘려도 기존 버튼은 그대로다.
       */
      radius: {
        default: '',
        // 8px를 값으로 못박는다 — 이 Tailwind 버전의 `rounded-lg`는 12px라 요청과 어긋났다(실측).
        lg: 'rounded-[8px]',
      },
      pad: {
        default: '',
        wide: 'px-4',
      },
    },
    compoundVariants: [
      // pill(rounded-full)은 주 액션 신호 — DESIGN의 primary CTA 문법.
      { variant: 'primary', radius: 'default', class: 'rounded-full' },
      { variant: 'ghost', radius: 'default', class: 'rounded-md' },
      { variant: 'danger', radius: 'default', class: 'rounded-md' },
      { size: 'sm', pad: 'default', class: 'px-2' },
      { size: 'md', pad: 'default', class: 'px-3' },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      radius: 'default',
      pad: 'default',
    },
  },
);

export interface ButtonProps extends MotionButtonAttributes, VariantProps<typeof button> {}

export function Button({
  className,
  variant,
  size,
  radius,
  pad,
  type = 'button',
  ...props
}: ButtonProps) {
  const press = usePressMotion(props.disabled);
  return (
    <m.button
      type={type}
      className={button({ variant, size, radius, pad, className })}
      {...press}
      {...props}
    />
  );
}
