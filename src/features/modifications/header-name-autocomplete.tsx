import { Autocomplete } from '@base-ui-components/react/autocomplete';
import { Input, type InputProps } from '@/ui/input';
import { popupItem, popupSurface } from '@/ui/tokens';

export interface HeaderNameAutocompleteProps
  extends Pick<InputProps, 'variant' | 'size' | 'autoFocus'> {
  value: string;
  onChange: (next: string) => void;
  /** 이미 산출된 후보 — 이 컴포넌트는 후보를 만들지도 거르지도 않는다. */
  suggestions: readonly string[];
  /** placeholder 겸 접근성 이름 (카탈로그는 eager 쪽에서 읽어 넘긴다). */
  label: string;
  className?: string;
}

/**
 * 헤더 이름 자동완성 팝업 — Base UI Autocomplete (ADR 0011).
 *
 * **이 모듈만 지연 청크에 들어간다** — header-name-input이 lazy로 가져온다. 규칙 폼을
 * 열어야 보이는 UI라 팝업 초기 번들에 있을 이유가 없다(실측 +14.5KB). 선행 예:
 * sortable-profile-list(dnd-kit). 번들 게이트가 이 청크가 즉시 집합에 새지 않는지 본다.
 *
 * `mode="none"` — 후보 산출은 core의 `suggestHeaderNames`가 계속 담당하고 여기서는
 * 필터링도 인라인 완성도 하지 않는다. 사용자 항목 우선·대소문자 무시 중복 제거·상한
 * 8개라는 검증된 도메인 규칙과 그 vitest를 보존하기 위해서다. 이 컴포넌트가 맡는 것은
 * 렌더링·키보드·팝업 시맨틱뿐이다.
 */
export default function HeaderNameAutocomplete({
  value,
  onChange,
  suggestions,
  label,
  className,
  variant,
  size,
  autoFocus,
}: HeaderNameAutocompleteProps) {
  return (
    <Autocomplete.Root mode="none" items={suggestions} value={value} onValueChange={onChange}>
      <Autocomplete.Input
        render={
          <Input
            variant={variant}
            size={size}
            autoFocus={autoFocus}
            placeholder={label}
            aria-label={label}
            autoComplete="off"
            className={className}
          />
        }
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={4} className="z-50 outline-none">
          {/* 앵커 폭 이상으로 열린다 — Select 팝업과 같은 규칙. */}
          <Autocomplete.Popup className={`min-w-[var(--anchor-width)] outline-none ${popupSurface}`}>
            <Autocomplete.List>
              {(item: string) => (
                <Autocomplete.Item
                  key={item}
                  value={item}
                  className={`text-zinc-700 dark:text-zinc-200 ${popupItem}`}
                >
                  {item}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
