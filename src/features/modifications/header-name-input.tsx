import { useEffect, useId, useReducer, useState, type ComponentType } from 'react';
import { suggestHeaderNames } from '@/core/autocomplete';
import { Input, type InputProps } from '@/ui/input';
import { useT } from '@/ui/i18n-context';
import type { HeaderNameAutocompleteProps } from './header-name-autocomplete';

/**
 * Base UI Autocomplete는 이 동적 import 청크에만 있다 — 규칙 폼을 열어야 보이는 UI라
 * 팝업 초기 번들에서 제외된다(실측 26.5KB). 선행 예: sortable-profile-list의 dnd-kit.
 *
 * **`React.lazy`를 쓰지 않는다.** lazy는 첫 렌더에서 한 번 서스펜드했다가 재시도하는데,
 * 모듈이 이미 도착해 있어도 그 왕복이 실측 ~250ms였다. 헤더 이름 필드는 autoFocus라
 * 사용자가 폼을 열자마자 타이핑하고, 그 250ms 동안 브라우저 기본 datalist를 보게 된다 —
 * story 4가 없애려는 바로 그 경험이다. 그래서 받아 둔 컴포넌트를 모듈 스코프에 두고
 * 곧바로 동기 렌더한다. 이 방식에서는 교체까지 실측 0~7ms다.
 *
 * **미리 받아 두지도 않는다.** requestIdleCallback으로 앞당겨 봤지만, 팝업 시작이 워낙
 * 짧아 유휴 콜백이 첫 페인트 **전에** 끼어들어 first paint가 ~62 → ~85ms로 늘었다(실측).
 * 교체가 이미 눈에 띄지 않는 이상, story 31이 지키려는 시작 속도를 내주면서까지 앞당길
 * 이유가 없다.
 */
let resolved: ComponentType<HeaderNameAutocompleteProps> | null = null;
let pending: Promise<void> | null = null;
const waiting = new Set<() => void>();

function loadAutocomplete(): Promise<void> {
  pending ??= import('./header-name-autocomplete').then((module) => {
    resolved = module.default;
    for (const notify of waiting) notify();
  });
  return pending;
}

/** 도착해 있으면 그 컴포넌트를, 아니면 null을 준다. 아직이면 도착 시 다시 렌더한다. */
function useAutocompleteComponent(): ComponentType<HeaderNameAutocompleteProps> | null {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (resolved) return;
    waiting.add(rerender);
    void loadAutocomplete();
    return () => {
      waiting.delete(rerender);
    };
  }, []);
  return resolved;
}

export interface HeaderNameInputProps extends Pick<InputProps, 'variant' | 'size' | 'autoFocus'> {
  value: string;
  onChange: (next: string) => void;
  userHeaders: readonly string[];
  className?: string;
}

/**
 * 헤더 이름 입력 — 표준 사전 + 사용자 항목으로 제안한다.
 *
 * 후보 산출은 여기(정확히는 core의 `suggestHeaderNames`)서 끝난다. 아래 두 표현 모두
 * 같은 배열을 받아 그리기만 하므로 어느 쪽이 렌더되든 제안 내용은 동일하다.
 */
export function HeaderNameInput({
  value,
  onChange,
  userHeaders,
  className,
  variant,
  size,
  autoFocus,
}: HeaderNameInputProps) {
  const t = useT();
  const label = t('headerName');
  const suggestions = suggestHeaderNames(value, userHeaders);
  const Autocomplete = useAutocompleteComponent();

  // autoFocus를 양쪽에 그대로 넘긴다. 교체가 0~7ms라 fallback이 포커스를 잡았다가
  // 새 입력이 이어받는 것이 한 프레임 안에서 끝난다. "이미 소비했으면 넘기지 않는다"는
  // 가드를 뒀다가 되돌렸다 — 교체가 빠른 정상 경로에서 fallback이 포커스를 쥔 채
  // 사라지고 새 입력은 포커스를 안 받아, 폼을 열어도 아무 데도 포커스가 없었다.
  // 원래 우려했던 "사용자가 다른 필드로 옮긴 뒤 포커스를 도로 뺏김"은 React.lazy의
  // ~250ms 창에서 나온 것이고, lazy를 걷어내면서 그 창 자체가 사라졌다.
  const shared = { value, onChange, suggestions, label, className, variant, size, autoFocus };

  return Autocomplete ? <Autocomplete {...shared} /> : <PlainHeaderNameInput {...shared} />;
}

interface PlainHeaderNameInputProps extends Pick<InputProps, 'variant' | 'size' | 'autoFocus'> {
  value: string;
  onChange: (next: string) => void;
  suggestions: readonly string[];
  label: string;
  className?: string;
}

/**
 * 청크 도착 전 표현 — 네이티브 datalist. 같은 `Input` 프리미티브를 같은 변형으로 쓰므로
 * 교체 시 시각 점프가 없고, 제안 목록도 위와 같은 배열이다. 도착이 0~7ms라 이 표현이
 * 보이는 시간은 사실상 없지만, 보이더라도 기능이 끊기지는 않는다.
 */
function PlainHeaderNameInput({
  value,
  onChange,
  suggestions,
  label,
  className,
  variant,
  size,
  autoFocus,
}: PlainHeaderNameInputProps) {
  const listId = useId();
  const [focused, setFocused] = useState(false);

  return (
    <>
      <Input
        variant={variant}
        size={size}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={label}
        aria-label={label}
        list={listId}
        autoComplete="off"
        className={className}
      />
      <datalist id={listId}>
        {focused && suggestions.map((name) => <option key={name} value={name} />)}
      </datalist>
    </>
  );
}
