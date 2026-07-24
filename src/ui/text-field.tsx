import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Input as ShadcnInput } from '@/ui/input';
import { Textarea as ShadcnTextarea } from '@/ui/textarea';
import { cn } from './cn';

/**
 * 앱의 텍스트 필드 — shadcn Input/Textarea를 감싸 이 저장소의 **크기·서체 축**을 유지한다.
 * shadcn 소스(`input.tsx`·`textarea.tsx`)는 손대지 않는다(ADR 0014).
 *
 * 축을 되살린 이유는 취향이 아니라 계약이다. 이 앱은 팝업이 760×580으로 고정이라
 * 필드 높이가 곧 한 화면에 담기는 행 수를 정하고, 스모크가 실제 픽셀을 단언한다
 * (예: N25의 매치 방식 셀렉트 폭 136px, N19a의 행 높이). shadcn 기본은 h-8 하나뿐이라
 * 그대로 쓰면 조밀한 자리(조건 필드·인라인 편집)가 전부 커진다.
 *
 * 덮어쓰기가 성립하는 것은 cn(twMerge) 덕이다 — 뒤에 오는 `h-7`이 shadcn의 `h-8`을
 * 이긴다. tailwind-merge를 들인 값을 여기서 돌려받는다.
 */
const field = cva('', {
  variants: {
    variant: {
      solid: '',
      // 표면이 없는 필드 — 값이 텍스트처럼 읽히다가 포커스에서만 경계가 드러난다.
      ghost: 'border-transparent bg-transparent dark:bg-transparent',
    },
    size: {
      xs: 'h-6 px-1 text-[11px]',
      sm: 'h-7 px-2 text-xs',
      md: 'h-8 px-2 text-sm',
    },
    font: { sans: '', mono: 'font-mono' },
    align: { start: '', center: 'text-center' },
  },
  defaultVariants: { variant: 'solid', size: 'md', font: 'sans', align: 'start' },
});

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof field> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { variant, size, font, align, className, type = 'text', ...props },
  ref,
) {
  return (
    <ShadcnInput
      ref={ref}
      type={type}
      className={cn(field({ variant, size, font, align }), className)}
      {...props}
    />
  );
});

/** 여러 줄 필드 — 높이 대신 패딩으로 크기를 정하므로 별도 축을 쓴다. */
const area = cva('', {
  variants: {
    font: { sans: '', mono: 'font-mono' },
    size: { sm: 'text-xs', md: 'text-sm' },
  },
  defaultVariants: { font: 'sans', size: 'md' },
});

export interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'>,
    VariantProps<typeof area> {}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { font, size, className, ...props },
  ref,
) {
  return <ShadcnTextarea ref={ref} className={cn(area({ font, size }), className)} {...props} />;
});
