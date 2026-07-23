import { Menu as BaseMenu } from '@base-ui-components/react/menu';
import { cva, type VariantProps } from 'class-variance-authority';
import { m } from 'motion/react';
import type { ComponentProps } from 'react';
import { MENU_ITEM_FADE_S, MENU_ITEM_STAGGER_S } from './motion-tokens';
import { useMotionProps, usePressMotion } from './press-motion';
import { popupItem, popupSurface } from './tokens';

/**
 * 항목 순차 등장 (ADR 0012) — 한꺼번에 튀어나오지 않고 눈이 따라갈 수 있게 한다.
 * 팝업이 오케스트레이터고 항목이 자식이다. 타이밍은 motion-tokens가 단일 출처이며
 * 스모크가 같은 값을 import해 "아직 진행 중" 창을 잡는다.
 */
const popupStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: MENU_ITEM_STAGGER_S } },
};

const itemAppear = {
  hidden: { opacity: 0, y: -4 },
  visible: { opacity: 1, y: 0, transition: { duration: MENU_ITEM_FADE_S } },
};

/**
 * 드롭다운 메뉴 — 빈도 낮은 조작(이동/복제/삭제)을 헤더의 아이콘 나열 대신
 * 케밥 메뉴 하나로 모은다 (ADR 0004). 키보드(화살표·Enter·Esc)와 role=menu 시맨틱은
 * Base UI가 제공한다. 표면은 무그림자 — 보더+명도로 구분한다.
 */
export function Menu(props: ComponentProps<typeof BaseMenu.Root>) {
  return <BaseMenu.Root {...props} />;
}

export function MenuTrigger(props: ComponentProps<typeof BaseMenu.Trigger>) {
  return <BaseMenu.Trigger {...props} />;
}

export function MenuPopup({
  className,
  children,
  ...props
}: ComponentProps<typeof BaseMenu.Popup>) {
  const stagger = useMotionProps({ variants: popupStagger, initial: 'hidden', animate: 'visible' });
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner align="end" sideOffset={4}>
        <BaseMenu.Popup
          className={`min-w-36 ${popupSurface} ${className ?? ''}`}
          // reduced-motion이면 오케스트레이션 자체를 걸지 않는다 — 자식도 variants를
          // 받지 않으므로 항목이 처음부터 완성된 상태로 그려진다.
          // 호출자가 render를 넘기면 이 모션이 사라진다 — 앱 내부 프리미티브라 현재는
          // 호출자가 하나뿐이고, 넘길 일이 생기면 합성 방식을 다시 정해야 한다.
          render={<m.div {...stagger} />}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

const menuItem = cva(
  `w-full data-[disabled]:pointer-events-none data-[disabled]:opacity-40 ${popupItem}`,
  {
    variants: {
      tone: {
        default: 'text-zinc-700 dark:text-zinc-200',
        danger: 'text-red-600 dark:text-red-400',
      },
    },
    defaultVariants: { tone: 'default' },
  },
);

export interface MenuItemProps
  extends ComponentProps<typeof BaseMenu.Item>,
    VariantProps<typeof menuItem> {}

export function MenuItem({ tone, className, ...props }: MenuItemProps) {
  // 메뉴 항목도 버튼 프리미티브다 (ADR 0012) — 누름·호버를 같은 헬퍼로 통일한다.
  // 비활성은 cva의 data-[disabled]:pointer-events-none이 이미 제스처를 막는다.
  const press = usePressMotion();
  const appear = useMotionProps({ variants: itemAppear });
  return (
    <BaseMenu.Item
      className={menuItem({ tone, className })}
      render={<m.div {...press} {...appear} />}
      {...props}
    />
  );
}
