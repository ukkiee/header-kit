import { Autocomplete } from '@base-ui/react/autocomplete';
import { useState, type Ref } from 'react';
import type { Suggestion } from '@/core/autocomplete';
import { Input, type InputProps } from '@/ui/text-field';
import { popupAnchored, popupItemText, popupPositioner } from '@/ui/tokens';

export interface SuggestAutocompleteProps extends Pick<InputProps, 'variant' | 'size' | 'autoFocus'> {
  value: string;
  onChange: (next: string) => void;
  /** 이미 산출된 후보 — 이 컴포넌트는 후보를 만들지도 거르지도 않는다. */
  suggestions: readonly Suggestion[];
  /** 접근성 이름 (카탈로그는 eager 쪽에서 읽어 넘긴다). */
  label: string;
  /**
   * 입력이 비었을 때의 **예시** — 라벨과 따로 둔다.
   *
   * 한 값으로 겸하면 라벨이 이미 FieldLabeled에 있는 자리에서 같은 말이 두 번 서고, 무엇을
   * 넣어야 하는지 알려 주던 힌트(`Mozilla/5.0 …`)가 사라진다.
   */
  placeholder?: string;
  className?: string;
  /** 실제 입력 요소로 가는 ref — 검증 실패 포커스에 쓴다(티켓 08). */
  ref?: Ref<HTMLInputElement>;
}

/**
 * 제안 팝업 (헤더 이름·쿠키 이름·User-Agent 공용) — Base UI Autocomplete (ADR 0011).
 *
 * **이 모듈만 지연 청크에 들어간다** — suggest-input이 lazy로 가져온다. 규칙 폼을
 * 열어야 보이는 UI라 팝업 초기 번들에 있을 이유가 없다(실측 +14.5KB). 선행 예:
 * sortable-profile-list(dnd-kit). 번들 게이트가 이 청크가 즉시 집합에 새지 않는지 본다.
 *
 * `mode="none"` — 후보 산출은 core의 `suggest*` 함수들이 계속 담당하고 여기서는
 * 필터링도 인라인 완성도 하지 않는다. 사용자 항목 우선·대소문자 무시 중복 제거·상한
 * 8개라는 검증된 도메인 규칙과 그 vitest를 보존하기 위해서다. 이 컴포넌트가 맡는 것은
 * 렌더링·키보드·팝업 시맨틱뿐이다.
 */
export default function SuggestAutocomplete({
  value,
  onChange,
  suggestions,
  label,
  placeholder,
  className,
  variant,
  size,
  autoFocus,
  ref,
}: SuggestAutocompleteProps) {
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
            placeholder={placeholder ?? label}
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
        직접 친 이름은 후보가 없는 게 정상이라 가장 흔한 입력에서 벌어진다.

        Esc도 이걸로 옳아진다 — 후보가 있으면 팝업만 닫히고(story 8), 없으면 애초에
        팝업이 없으므로 Esc가 폼을 닫는 기존 동작(N18d)이 그대로 유지된다.
      */}
      {suggestions.length > 0 && (
        <Autocomplete.Portal>
          <Autocomplete.Positioner sideOffset={4} className={popupPositioner}>
            <Autocomplete.Popup className={popupAnchored}>
              <Autocomplete.List>
                {/*
                  **보여 주는 것과 넣는 것이 다를 수 있다** (티켓 08) — User-Agent는 사람이
                  아는 이름(`Chrome (Windows)`)으로 찾고 들어가는 것은 전체 문자열이다.
                  헤더·쿠키는 둘이 같아 차이가 드러나지 않는다.
                */}
                {(item: Suggestion) => (
                  <Autocomplete.Item key={item.value} value={item.value} className={popupItemText}>
                    {item.label}
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
