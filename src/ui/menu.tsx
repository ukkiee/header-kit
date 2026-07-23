import { Menu as BaseMenu } from '@base-ui-components/react/menu';
import { cva, type VariantProps } from 'class-variance-authority';
import { m } from 'motion/react';
import type { ComponentProps } from 'react';
import { usePressMotion } from './press-motion';
import { popupItem, popupSurface } from './tokens';

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
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner align="end" sideOffset={4}>
        <BaseMenu.Popup className={`min-w-36 ${popupSurface} ${className ?? ''}`} {...props}>
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
  return (
    <BaseMenu.Item
      className={menuItem({ tone, className })}
      render={<m.div {...press} />}
      {...props}
    />
  );
}
