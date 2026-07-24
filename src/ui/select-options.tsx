import { cva, type VariantProps } from 'class-variance-authority';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { cn } from './cn';
import { selectFixedWidth } from './tokens';

/**
 * options 배열로 쓰는 Select — shadcn의 합성 API(Trigger/Content/Item) 위에 얹은 앱 레벨
 * 조합이다. shadcn 소스(`select.tsx`)는 손대지 않는다(ADR 0014): 이 파일은 그 소스를
 * 조합만 하므로 shadcn을 재복사해도 여기만 다시 맞추면 된다.
 *
 * 래퍼를 둔 이유는 두 가지다.
 * 1. 이 앱의 셀렉트는 전부 "값 목록 하나를 고르는" 같은 모양이다 — 호출부 여섯 곳이
 *    똑같은 Trigger/Content/Item 조합을 베껴 쓰면 팝업 규칙이 곧 자리마다 어긋난다.
 * 2. 팝업 위치 규칙(아래로 열리고 좌변 정렬)을 한 곳에 못박기 위해서다. 아래 주석 참고.
 */
const trigger = cva('', {
  variants: {
    /**
     * 폭 정책. 기본은 `auto` — 대부분의 셀렉트는 Field나 그리드가 폭을 정해 준다.
     * `fixed`는 **다른 컨트롤과 같은 행에 있어 폭이 변하면 옆을 미는** 자리에만 준다.
     * 값 근거는 tokens.ts의 selectFixedWidth 주석에 있고, 스모크 N25가 지킨다.
     */
    width: {
      auto: '',
      fixed: selectFixedWidth,
    },
  },
  defaultVariants: { width: 'auto' },
});

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

/** 값 타입 T가 현재 값·옵션·콜백에 일관 적용된다 — 호출부가 도메인 union을 그대로 쓴다. */
export interface SelectOptionsProps<T extends string> extends VariantProps<typeof trigger> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  'aria-label'?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function SelectOptions<T extends string>({
  width,
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
        크기 문제만이 아니다: 14px에서는 매치 방식의 최장 라벨(en `Regex (advanced)`)이
        고정 폭 안에서 잘렸다(N25). 폼의 다른 필드(Input size="sm")와도 글자 크기가 갈린다.
      */}
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        size="sm"
        className={cn('text-xs', trigger({ width }), className)}
      >
        <SelectValue className="truncate" />
      </SelectTrigger>
      {/*
        `alignItemWithTrigger={false}` — shadcn 기본값은 true이고, 그때는 **선택된 항목이
        트리거 위에 겹치도록** 팝업 전체를 끌어올린다(macOS 네이티브 셀렉트 방식). 그 모드에서는
        side·align·sideOffset이 무시되어 팝업이 트리거를 가리고 좌우도 밀려 보인다.

        이 앱의 다른 팝업(메뉴·자동완성)은 전부 앵커 아래로 떨어지는 드롭다운이다. 셀렉트만
        다른 규칙을 쓰면 같은 표면이 자리마다 다르게 움직인다. 스모크 N30이 이를 지킨다.

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
          // 팝업이 트리거보다 좁아 보이지 않게. role="listbox"는 Popup이 아니라 안쪽
          // List가 갖는데 shadcn이 거기에 폭을 주지 않아 콘텐츠 폭으로 줄어든다(N25).
          'min-w-[var(--anchor-width)] [&>[role=listbox]]:w-full',
        )}
      >
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
