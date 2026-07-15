import { useEffect, useState } from 'react';
import { Input, type InputProps } from './input';

/**
 * 초안 입력 — 로컬 초안으로 편집하고 blur/Enter에서만 커밋한다.
 * 저장 시점 regex 검증이 타이핑 중간 상태('(', '[' …)를 거부하면 통제 입력이
 * 되돌아가 입력 자체가 불가능해지기 때문. Input recipe 위에 얹는다.
 */
export function DraftInput({
  value,
  onCommit,
  ...props
}: { value: string; onCommit: (next: string) => void } & Omit<InputProps, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      {...props}
    />
  );
}
