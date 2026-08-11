import { Tooltip } from '@base-ui/react/tooltip';
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
  `flex shrink-0 cursor-pointer items-center rounded-md transition-colors ${focusRing}`,
  {
    variants: {
      tone: {
        default: ghostInteractive,
        // 파괴적 톤은 시맨틱 `--destructive` 하나에서 온다 — 채움 농도는 Button의
        // destructive 변형과 같은 값(라이트 /10, 다크 /20)이라 두 표기가 갈리지 않는다.
        danger:
          'text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20',
      },
      /**
       * `sm`은 행 안에 여럿 늘어서는 반복 액션(편집/삭제), `md`는 단독으로 서는
       * 내비게이션. 레일을 sm으로 바꾸면 32×28 → 24×24로 클릭 대상이 줄어든다.
       *
       * `rail`은 레일 전용 셸(티켓 10) — 칸 폭을 가득 채우고 **아이콘 아래에** 보이는 라벨을
       * 세운다. 가로 배치였던 것을 세로로 바꾼 것은 ADR 0017의 시안 폭 68px 때문이다: 그 폭에
       * 가로로 놓으면 아이콘이 라벨에 밀려 뭉개진다. `justify-*`가 베이스가 아니라 각 크기에
       * 붙어 있는 이유가 이것이다: 베이스에 두면 두 유틸이 한 클래스 목록에 함께 실려
       * 승자가 CSS 출력 순서에 달리고, 그건 소스에서 읽히지 않는다.
       */
      size: {
        sm: 'size-6 justify-center',
        md: 'h-7 w-8 justify-center',
        rail: 'h-auto w-full flex-col justify-center gap-1 px-1 py-2 text-[10px] leading-3',
      },
    },
    defaultVariants: { tone: 'default', size: 'sm' },
  },
);

/** 셸 크기와 짝을 이루는 아이콘 px — 둘이 따로 놀면 여백이 어긋난다. */
const ICON_PX = { sm: 14, md: 16, rail: 20 } as const;

/** 인접 아이콘 사이 툴팁 딜레이 그룹화 — 셸(App) 루트에서 한 번 감싼다. */
export function IconTooltipProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delay={300}>{children}</Tooltip.Provider>;
}

export interface IconButtonProps
  extends Omit<MotionButtonAttributes, 'children'>, VariantProps<typeof iconButton> {
  /** aria-label 겸 기본 툴팁 텍스트. */
  label: string;
  /** 툴팁 표시 문구 덮어쓰기 (aria-label은 label 유지). */
  tooltip?: string;
  /**
   * 아이콘 옆에 **보이는** 짧은 라벨 (레일, 티켓 10). aria-label(`label`)은 그대로
   * 남는다 — 보이는 라벨은 폭에 맞춰 짧고, 접근성 이름은 동작을 온전히 말한다.
   */
  text?: string;
  icon: LucideIcon;
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  label,
  tooltip,
  text,
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
        <>
          <Icon size={ICON_PX[size ?? 'sm']} strokeWidth={1.75} />
          {text && <span className="min-w-0 truncate">{text}</span>}
        </>
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
