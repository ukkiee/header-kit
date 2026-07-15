import { useId, useState } from 'react';
import { suggestHeaderNames } from '@/core/autocomplete';

export interface HeaderNameInputProps {
  value: string;
  onChange: (next: string) => void;
  userHeaders: readonly string[];
  className?: string;
}

/** 헤더 이름 입력 — 표준 사전 + 사용자 항목으로 autocomplete 제안한다. */
export function HeaderNameInput({ value, onChange, userHeaders, className }: HeaderNameInputProps) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const suggestions = focused ? suggestHeaderNames(value, userHeaders) : [];

  return (
    <>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Header name"
        aria-label="Header name"
        list={listId}
        autoComplete="off"
        className={className}
      />
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}
