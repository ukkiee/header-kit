import { Field as BaseField } from '@base-ui-components/react/field';
import type { ReactNode } from 'react';

/** 필드 캡션 스타일 — Field.Label과, Field를 못 쓰는 다중 컨트롤 행의 span 캡션이 공유한다. */
export const fieldCaption = 'text-xs font-medium text-zinc-600 dark:text-zinc-300';

/** 인라인 오류 스타일 — Field.Error와, Field 밖(CSP 디렉티브 목록 등)의 오류 문구가 공유한다. */
export const fieldErrorClass = 'text-xs text-red-600 dark:text-red-400';

/** Field 컨텍스트를 못 쓰는 자리(다중 컨트롤 그룹)의 인라인 오류 문구. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className={fieldErrorClass}>
      {children}
    </p>
  );
}

export interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  /** 인라인 오류 — 있으면 필드가 invalid가 되고(컨트롤에 aria-invalid) 라벨 아래 표시된다. */
  error?: string;
}

/**
 * 폼 필드 셸 — Base UI Field 기반 (ADR 0011). 라벨-컨트롤 연결은 Field 컨텍스트가
 * 자동으로 맺는다(Base UI Input/Select/Checkbox가 스스로 등록) — 라벨 요소로 컨트롤을
 * 감싸지 않으므로, 라벨 호버가 첫 컨트롤에 전파되던 문제 구조가 없다.
 * 검증 표시(aria-invalid·인라인 오류)는 같은 Field 컨텍스트에 얹는다 (ui-refine 04).
 */
export function Field({ label, children, className, error }: FieldProps) {
  return (
    <BaseField.Root invalid={error !== undefined} className={`flex flex-col gap-1 ${className ?? ''}`}>
      <BaseField.Label className={fieldCaption}>{label}</BaseField.Label>
      {children}
      {error !== undefined && (
        <BaseField.Error match className={fieldErrorClass} role="alert">
          {error}
        </BaseField.Error>
      )}
    </BaseField.Root>
  );
}
