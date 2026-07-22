import { Tooltip } from '@base-ui-components/react/tooltip';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { ghostInteractive, tooltipPopup } from './tokens';

/**
 * 아이콘 버튼 + 툴팁 (ADR 0011) — 반복 액션(편집/삭제/복원/펼침)의 공통 셸.
 * label 하나가 aria-label과 툴팁 텍스트를 겸해 이름이 갈라지지 않는다
 * (tooltip으로 표시 문구만 덮어쓸 수 있다). 호버·키보드 포커스 모두 툴팁이 열린다.
 * Base UI render 합성을 위해 나머지 버튼 props와 ref를 그대로 통과시킨다.
 */
const iconButton = cva(
  'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors',
  {
    variants: {
      tone: {
        default: ghostInteractive,
        danger:
          'text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-950 dark:hover:text-red-400',
      },
    },
    defaultVariants: { tone: 'default' },
  },
);

/** 인접 아이콘 사이 툴팁 딜레이 그룹화 — 셸(App) 루트에서 한 번 감싼다. */
export function IconTooltipProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delay={300}>{children}</Tooltip.Provider>;
}

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
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
  className,
  ref,
  ...props
}: IconButtonProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <button
            type="button"
            ref={ref}
            aria-label={label}
            className={iconButton({ tone, className })}
            {...props}
          />
        }
      >
        <Icon size={14} strokeWidth={1.75} />
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
