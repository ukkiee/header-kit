import { cva, type VariantProps } from 'class-variance-authority';
import type { ElementType, HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * severity 배너 — info/warn/danger의 인라인 배너.
 *
 * shadcn `alert.tsx`를 쓰지 않는 이유가 두 가지다.
 * 1. **시맨틱**: shadcn Alert는 div로 고정이라 `as`가 없다. 이 앱의 배너 일부는 실제로
 *    `<ul>`/`<li>`다(가져오기 오류 목록, 상태 요약의 경고 목록) — div로 바꾸면 스크린리더가
 *    "목록, 항목 N개"를 잃는다. 접근성 시맨틱을 소스 재복사 편의와 맞바꾸지 않는다.
 * 2. **단계**: shadcn은 default·destructive 두 변형뿐이라 '주의(warn)'가 없다. 일시정지처럼
 *    오류는 아니지만 동작이 멈춘 상태를 표현할 자리가 사라진다.
 *
 * 색은 대비를 실측해 고른 값이다(흰 배경 기준 info 6.34:1 · warn 4.84:1 · danger 5.91:1) —
 * 11px에서도 일반 텍스트 기준 4.5:1을 넘는다.
 */
const alert = cva('rounded-md px-2 py-1', {
  variants: {
    severity: {
      info: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      danger: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    },
    /**
     * 행간을 크기와 함께 낸다 — `text-[11px]`은 Tailwind 임의값이라 line-height를
     * 데려오지 않아 예전에는 부모 값을 상속했다(ui-review UI-16). 배너는 이 앱에서
     * 실제로 여러 줄이 되는 거의 유일한 본문이라 줄 추적이 중요하다.
     */
    size: { xs: 'text-[11px] leading-relaxed', sm: 'text-xs leading-relaxed' },
  },
  defaultVariants: { severity: 'info', size: 'sm' },
});

export interface AlertBannerProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof alert> {
  as?: ElementType;
}

export function AlertBanner({
  as: Tag = 'p',
  severity,
  size,
  className,
  ...props
}: AlertBannerProps) {
  return <Tag className={cn(alert({ severity, size }), className)} {...props} />;
}
