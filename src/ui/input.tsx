import { Input as BaseInput } from '@base-ui-components/react/input';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { fieldFocus, fieldSolid } from './tokens';

/**
 * 텍스트 필드 recipe — 앱 전반의 solid 필드 문자열을 흡수한다.
 * Base UI Input 기반 (ADR 0011): 네이티브 input을 렌더하면서 Field 컨텍스트에
 * 자동 등록되어 라벨 연결·검증 시맨틱을 얻는다. datalist 등 네이티브 속성은 그대로 통과한다.
 * 호출자는 레이아웃 유틸(flex-1/w-32 등)만 className으로 append 한다(override 아님).
 */
const field = cva('rounded-md', {
  variants: {
    variant: {
      solid: `${fieldSolid} ${fieldFocus}`,
      ghost: 'border border-transparent bg-transparent outline-none focus:border-zinc-300 dark:focus:border-zinc-700',
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
    <BaseInput ref={ref} type={type} className={field({ variant, size, font, align, className })} {...props} />
  );
});

/** 여러 줄 필드 — 높이 대신 p-2 패딩을 쓰므로 별도 recipe(같은 표면 토큰 공유). */
const area = cva(`rounded-md p-2 ${fieldSolid} ${fieldFocus}`, {
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
  return <textarea ref={ref} className={area({ font, size, className })} {...props} />;
});
