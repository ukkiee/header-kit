import { Menu as BaseMenu } from '@base-ui-components/react/menu';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

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
        <BaseMenu.Popup
          className={`min-w-36 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900 ${className ?? ''}`}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

const menuItem = cva(
  'flex w-full cursor-pointer items-center rounded-md px-2 py-1.5 text-xs outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-zinc-100 dark:data-[highlighted]:bg-zinc-800',
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
  return <BaseMenu.Item className={menuItem({ tone, className })} {...props} />;
}
