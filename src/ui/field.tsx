import { Field as BaseField } from '@base-ui-components/react/field';
import type { ReactNode } from 'react';

/** 필드 캡션 스타일 — Field.Label과, Field를 못 쓰는 다중 컨트롤 행의 span 캡션이 공유한다. */
export const fieldCaption = 'text-xs font-medium text-zinc-600 dark:text-zinc-300';

export interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * 폼 필드 셸 — Base UI Field 기반 (ADR 0011). 라벨-컨트롤 연결은 Field 컨텍스트가
 * 자동으로 맺는다(Base UI Input/Select/Checkbox가 스스로 등록) — 라벨 요소로 컨트롤을
 * 감싸지 않으므로, 라벨 호버가 첫 컨트롤에 전파되던 문제 구조가 없다.
 * 검증 표시(aria-invalid·인라인 오류)는 같은 Field 컨텍스트에 얹는다.
 */
export function Field({ label, children, className }: FieldProps) {
  return (
    <BaseField.Root className={`flex flex-col gap-1 ${className ?? ''}`}>
      <BaseField.Label className={fieldCaption}>{label}</BaseField.Label>
      {children}
    </BaseField.Root>
  );
}
