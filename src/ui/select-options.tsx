import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/ui/select';
import { cn } from './cn';
import { popupItemSelected, popupItemText, selectFixedWidth } from './tokens';

/**
 * options 배열로 쓰는 Select — shadcn의 합성 API(Trigger/Content) 위에 얹은 앱 레벨
 * 조합이다. shadcn 소스(`select.tsx`)는 손대지 않는다(ADR 0014): 이 파일은 그 소스를
 * 조합만 하므로 shadcn을 재복사해도 여기만 다시 맞추면 된다.
 *
 * 래퍼를 둔 이유는 두 가지다.
 * 1. 이 앱의 셀렉트는 전부 "값 목록 하나를 고르는" 같은 모양이다 — 호출부들이 똑같은
 *    Trigger/Content/Item 조합을 베껴 쓰면 팝업 규칙이 곧 자리마다 어긋난다.
 * 2. 팝업 위치·폭·선택 표시 규칙을 한 곳에 못박기 위해서다. 아래 주석 참고.
 */

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

/** 값 타입 T가 현재 값·옵션·콜백에 일관 적용된다 — 호출부가 도메인 union을 그대로 쓴다. */
export interface SelectOptionsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  'aria-label'?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function SelectOptions<T extends string>({
  className,
  value,
  onValueChange,
  options,
  disabled,
  id,
  'aria-label': ariaLabel,
}: SelectOptionsProps<T>) {
  return (
    <Select
      // items를 함께 넘겨야 Trigger의 Value가 원시 값 대신 라벨을 표시한다.
      items={options}
      value={value}
      onValueChange={(next) => {
        // shadcn/Base UI는 해제 가능성 때문에 null을 흘려보낸다 — 이 앱의 셀렉트는
        // 전부 필수 값이라 null을 무시해 호출부가 nullable을 다루지 않게 한다.
        if (next !== null) onValueChange(next as T);
      }}
      disabled={disabled}
    >
      {/*
        `text-xs` — shadcn Trigger 기본은 text-sm(14px)인데 이 앱의 폼은 12px 계열이다.
        팝업 항목도 같은 12px를 쓰므로(아래 `popupItemText`) 트리거와 목록의 글자가 갈리지
        않는다 — 예전에는 트리거 12px에 목록 14px이라 같은 라벨이 두 크기로 보였다.

        **폭은 늘 고정이다** (`selectFixedWidth`). 변형으로 고를 수 있게 두던 것을 없앴다:
        `w-fit`으로 두면 트리거가 지금 고른 값에 맞춰 줄고, 팝업 폭은 앵커(=트리거)에서
        나오므로 **팝업이 그 폭에 갇혀 더 긴 라벨이 잘린다** — 종류 셀렉트의 ko
        `User-Agent 변경`이 실제로 그렇게 잘려 있었다. 값을 고를 때마다 옆 컨트롤이 밀리는
        문제도 같은 뿌리다. 폭 계산 근거는 tokens.ts의 `selectFixedWidth` 주석에 있고,
        스모크 N25가 en/ko 모든 옵션에서 트리거·팝업 양쪽의 미절단을 지킨다.
      */}
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        size="sm"
        className={cn('text-xs', selectFixedWidth, className)}
      >
        <SelectValue className="truncate" />
      </SelectTrigger>
      {/*
        `alignItemWithTrigger={false}` — shadcn 기본값은 true이고, 그때는 **선택된 항목이
        트리거 위에 겹치도록** 팝업 전체를 끌어올린다(macOS 네이티브 셀렉트 방식). 그 모드에서는
        side·align·sideOffset이 무시되어 팝업이 트리거를 가리고 좌우도 밀려 보인다.

        이 앱의 다른 팝업(자동완성)은 앵커 아래로 떨어지는 드롭다운이다. 셀렉트만 다른 규칙을
        쓰면 같은 표면이 자리마다 다르게 움직인다. 스모크 N30이 이를 지킨다.

        prop으로 끌 수 있으므로 shadcn 소스를 고치지 않고도 규칙을 지킨다.
      */}
      {/*
        열림·닫힘 모션은 여기 className이 아니라 **global.css**가 소유한다. shadcn의 keyframe
        애니메이션을 끄고 이 앱의 전이(180ms + 오버슈트 곡선, ADR 0012)로 되돌리는 규칙인데,
        Tailwind 임의값(`transition-[opacity,translate]`·`duration-[var(--popup-fade)]`)이
        CSS로 생성되지 않아 전이가 조용히 죽었다 — 클래스는 소스에 있는데 스타일이 없었다.
        스캐너에 기대지 않으려고 `[data-slot='select-content']` 규칙으로 옮겼다. 자세한 사정은
        global.css의 해당 블록과 ADR 0014의 경계 항목에 있다.
      */}
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className={cn(
          // shadcn Content는 min-w-36으로 앵커보다 좁아질 수 있다 — 트리거보다 좁은 팝업은
          // 목록이 트리거 안에서 잘려 보이는 인상을 준다. 앵커 폭을 하한으로 둔다.
          //
          // 안쪽 List에도 함께 줘야 한다 — role="listbox"를 갖는 것은 Popup이 아니라 그
          // List이고, shadcn은 거기에 폭을 주지 않아 콘텐츠 폭으로 줄어든다(N25가 잡았다).
          'min-w-[var(--anchor-width)] [&>[role=listbox]]:w-full',
        )}
      >
        {/*
          항목은 shadcn의 `SelectItem`이 아니라 **Base UI Item을 이 앱의 팝업 항목 토큰으로**
          직접 조합한다 (ADR 0014의 조합 파일 역할).

          이유가 둘이다. (1) shadcn 항목은 `text-sm`에 오른쪽 32px을 체크 표시 자리로 비워
          두는데, 이 앱의 팝업 항목 규약(`popupItemText`)은 12px에 좌우 8px이고 자동완성
          팝업이 이미 그것을 쓴다 — 같은 앱의 두 팝업이 다른 문법으로 그려지고 있었다.
          (2) 고른 항목을 체크(✓)가 아니라 **면**으로 말하려면(`popupItemSelected`) 그
          체크를 렌더하지 않아야 하는데, 그것은 shadcn 소스 안에 있어 고칠 수 없다. 안 그리면
          되는 것을 CSS로 숨기는 대신 여기서 조합하지 않는 쪽이 읽힌다.

          `whitespace-nowrap` — 라벨이 폭을 넘으면 **줄바꿈 대신 넘치게** 둔다. 접히면
          보기에는 멀쩡한데 폭 계산이 틀렸다는 사실이 화면에서도 스모크에서도 사라진다.
        */}
        {options.map((option) => (
          <SelectPrimitive.Item
            key={option.value}
            value={option.value}
            className={cn('whitespace-nowrap', popupItemText, popupItemSelected)}
          >
            <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
          </SelectPrimitive.Item>
        ))}
      </SelectContent>
    </Select>
  );
}
