import { Autocomplete } from '@base-ui-components/react/autocomplete';
import { useState, type Ref } from 'react';
import { Input, type InputProps } from '@/ui/input';
import { popupAnchored, popupItemText, popupPositioner } from '@/ui/tokens';

export interface HeaderNameAutocompleteProps
  extends Pick<InputProps, 'variant' | 'size' | 'autoFocus'> {
  value: string;
  onChange: (next: string) => void;
  /** 이미 산출된 후보 — 이 컴포넌트는 후보를 만들지도 거르지도 않는다. */
  suggestions: readonly string[];
  /** placeholder 겸 접근성 이름 (카탈로그는 eager 쪽에서 읽어 넘긴다). */
  label: string;
  className?: string;
  /** 실제 입력 요소로 가는 ref — 검증 실패 포커스에 쓴다(티켓 08). */
  ref?: Ref<HTMLInputElement>;
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
  ref,
}: HeaderNameAutocompleteProps) {
  const [open, setOpen] = useState(false);

  return (
    <Autocomplete.Root
      mode="none"
      items={suggestions}
      value={value}
      onValueChange={onChange}
      // 후보가 없으면 열림 상태로도 가지 않는다 — 아래 팝업을 안 그리는 것만으로는
      // aria-expanded가 참으로 남아 "펼쳐졌다"고 알리면서 보여 줄 것이 없다.
      open={open && suggestions.length > 0}
      onOpenChange={setOpen}
    >
      <Autocomplete.Input
        render={
          <Input
            ref={ref}
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
      {/*
        후보가 없으면 팝업 자체를 렌더하지 않는다. Base UI는 입력이 바뀌면 후보 수와
        무관하게 열림 상태로 가는데, 그대로 두면 (1) 빈 상자가 뜨고 (2) 팝업이 열린
        동안 floating-ui가 바깥을 aria-hidden 처리해 **폼 전체가 보조기술에서 사라진다.**
        커스텀 헤더 이름은 후보가 없는 게 정상이라 가장 흔한 입력에서 벌어진다.

        Esc도 이걸로 옳아진다 — 후보가 있으면 팝업만 닫히고(story 8), 없으면 애초에
        팝업이 없으므로 Esc가 폼을 닫는 기존 동작(N18d)이 그대로 유지된다.
      */}
      {suggestions.length > 0 && (
        <Autocomplete.Portal>
          <Autocomplete.Positioner sideOffset={4} className={popupPositioner}>
            <Autocomplete.Popup className={popupAnchored}>
              <Autocomplete.List>
                {(item: string) => (
                  <Autocomplete.Item key={item} value={item} className={popupItemText}>
                    {item}
                  </Autocomplete.Item>
                )}
              </Autocomplete.List>
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      )}
    </Autocomplete.Root>
  );
}
