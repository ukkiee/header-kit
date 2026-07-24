import { Field as BaseField } from '@base-ui/react/field';
import type { ReactNode } from 'react';
import { cn } from './cn';

/** 필드 캡션 스타일 — 라벨과, Field를 못 쓰는 다중 컨트롤 행의 span 캡션이 공유한다. */
export const fieldCaption = 'text-xs font-medium text-muted-foreground';

/** 인라인 오류 스타일 — 오류 문구가 Field 안팎에서 같은 모양이 되게 한다. */
export const fieldErrorClass = 'text-xs text-destructive';

/** Field 컨텍스트를 못 쓰는 자리(다중 컨트롤 그룹)의 인라인 오류 문구. */
export function InlineFieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className={fieldErrorClass}>
      {children}
    </p>
  );
}

export interface FieldLabeledProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  /** 인라인 오류 — 있으면 필드가 invalid가 되고(컨트롤에 aria-invalid) 라벨 아래 표시된다. */
  error?: string;
}

/**
 * 라벨 붙은 폼 필드 — **Base UI Field.Root** 위에 shadcn의 색 토큰을 입힌 앱 레벨 조합이다.
 *
 * shadcn의 `field.tsx`를 쓰지 않는 이유가 있다. 그쪽 Field는 순수 레이아웃 div라
 * 라벨-컨트롤 연결을 호출부가 id/htmlFor로 직접 맺어야 하고, aria-invalid도 자동으로
 * 퍼지지 않는다. 이 저장소는 ADR 0011에서 **Base UI Field 컨텍스트의 자동 연결**을
 * 택했고(라벨로 컨트롤을 감싸지 않아 호버 전파 버그가 구조에서 사라진다), 스모크 N26이
 * 검증 실패 시 첫 누락 입력으로 포커스가 가는 것까지 못박는다. 그 계약을 접근성 회귀와
 * 맞바꾸지 않는다.
 *
 * 대신 색은 shadcn 시맨틱 토큰(muted-foreground·destructive)을 쓴다 — 나머지 표면과
 * 같은 팔레트를 공유하므로 두 계층이 섞여도 색이 어긋나지 않는다. shadcn `field.tsx`
 * 소스는 그대로 남겨 둔다(재복사 시 그 파일만 갱신하면 된다).
 */
export function FieldLabeled({ label, children, className, error }: FieldLabeledProps) {
  return (
    <BaseField.Root invalid={error !== undefined} className={cn('flex flex-col gap-1', className)}>
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
