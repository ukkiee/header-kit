import { Tabs as BaseTabs } from '@base-ui-components/react/tabs';
import { cva } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';

/**
 * 언더라인 탭 (ADR 0004) — 한 화면에 한 관심사. 선택 표시는 하단 2px 액센트
 * 언더라인 하나로, 보더 대신 명도·여백으로 구분하는 디자인 언어를 따른다.
 * 키보드(화살표 이동·활성화)와 role=tab 시맨틱은 Base UI가 제공한다.
 */
const tabRecipe = cva(
  'flex cursor-pointer items-center gap-1.5 border-b-2 border-transparent px-0.5 pb-1.5 text-xs whitespace-nowrap text-zinc-500 transition active:scale-95 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 data-[selected]:border-blue-600 data-[selected]:font-medium data-[selected]:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 dark:data-[selected]:text-zinc-100',
);

export function Tabs(props: ComponentProps<typeof BaseTabs.Root>) {
  return <BaseTabs.Root {...props} />;
}

export function TabList({ className, ...props }: ComponentProps<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List
      className={`flex items-center gap-4 border-b border-zinc-200 dark:border-zinc-800 ${className ?? ''}`}
      {...props}
    />
  );
}

export interface TabProps extends ComponentProps<typeof BaseTabs.Tab> {
  /** 라벨 옆 개수 뱃지 — 탭을 열지 않고도 규모를 파악한다. */
  count?: number;
  children?: ReactNode;
}

export function Tab({ className, count, children, ...props }: TabProps) {
  return (
    <BaseTabs.Tab className={tabRecipe({ className })} {...props}>
      {children}
      {count !== undefined && (
        <span className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">{count}</span>
      )}
    </BaseTabs.Tab>
  );
}

export function TabPanel(props: ComponentProps<typeof BaseTabs.Panel>) {
  return <BaseTabs.Panel {...props} />;
}
