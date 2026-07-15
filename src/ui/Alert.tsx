import { cva, type VariantProps } from 'class-variance-authority';
import type { ElementType, HTMLAttributes } from 'react';

/**
 * severity 배너 — info/warn/danger. 앱 전반의 인라인 배너 문자열을 흡수하고
 * StatusSummary의 bg-red-100/rounded 드리프트를 표준(bg-*-50/rounded-md)으로 정규화한다.
 * `as`로 p/ul/li/div 등 어떤 요소로도 렌더한다(role 등은 그대로 전달).
 */
const alert = cva('rounded-md px-2 py-1', {
  variants: {
    severity: {
      info: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      danger: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    },
    size: { xs: 'text-[11px]', sm: 'text-xs' },
  },
  defaultVariants: { severity: 'info', size: 'sm' },
});

export interface AlertProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof alert> {
  as?: ElementType;
}

export function Alert({ as: Tag = 'p', severity, size, className, ...props }: AlertProps) {
  return <Tag className={alert({ severity, size, className })} {...props} />;
}
