import { Tooltip } from '@base-ui-components/react/tooltip';
import { m } from 'motion/react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { usePressMotion, type MotionButtonAttributes } from './press-motion';
import { focusRing, ghostInteractive, tooltipPopup } from './tokens';

/**
 * 아이콘 버튼 + 툴팁 (ADR 0011) — 반복 액션(편집/삭제/복원/펼침)의 공통 셸.
 * label 하나가 aria-label과 툴팁 텍스트를 겸해 이름이 갈라지지 않는다
 * (tooltip으로 표시 문구만 덮어쓸 수 있다). 호버·키보드 포커스 모두 툴팁이 열린다.
 * Base UI render 합성을 위해 나머지 버튼 props와 ref를 그대로 통과시킨다.
 */
const iconButton = cva(
  `flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors ${focusRing}`,
  {
    variants: {
      tone: {
        default: ghostInteractive,
        danger:
          'text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-950 dark:hover:text-red-400',
      },
      /**
       * `sm`은 행 안에 여럿 늘어서는 반복 액션(편집/삭제), `md`는 단독으로 서는
       * 내비게이션(레일). 레일을 sm으로 바꾸면 32×28 → 24×24로 클릭 대상이 줄어든다.
       */
      size: {
        sm: 'size-6',
        md: 'h-7 w-8',
      },
    },
    defaultVariants: { tone: 'default', size: 'sm' },
  },
);

/** 셸 크기와 짝을 이루는 아이콘 px — 둘이 따로 놀면 여백이 어긋난다. */
const ICON_PX = { sm: 14, md: 16 } as const;

/** 인접 아이콘 사이 툴팁 딜레이 그룹화 — 셸(App) 루트에서 한 번 감싼다. */
export function IconTooltipProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delay={300}>{children}</Tooltip.Provider>;
}

export interface IconButtonProps
  extends Omit<MotionButtonAttributes, 'children'>,
    VariantProps<typeof iconButton> {
  /** aria-label 겸 기본 툴팁 텍스트. */
  label: string;
  /** 툴팁 표시 문구 덮어쓰기 (aria-label은 label 유지). */
  tooltip?: string;
  icon: LucideIcon;
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  label,
  tooltip,
  icon: Icon,
  tone,
  size,
  className,
  ref,
  ...props
}: IconButtonProps) {
  const press = usePressMotion(props.disabled);
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <m.button
            type="button"
            ref={ref}
            aria-label={label}
            className={iconButton({ tone, size, className })}
            {...press}
            {...props}
          />
        }
      >
        <Icon size={ICON_PX[size ?? 'sm']} strokeWidth={1.75} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6}>
          {/* rc.0은 popup에 role을 주지 않는다 — WAI-ARIA tooltip 패턴대로 명시 */}
          <Tooltip.Popup role="tooltip" className={tooltipPopup}>
            {tooltip ?? label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
