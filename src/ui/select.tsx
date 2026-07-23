import { Select as BaseSelect } from '@base-ui-components/react/select';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, ChevronDown } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import {
  fieldFocus,
  fieldSolid,
  ghostInteractive,
  popupAnchored,
  popupItemText,
  popupPositioner,
  selectFixedWidth,
} from './tokens';

/**
 * Select — Base UI Select 기반 (ADR 0011). 팝업이 OS 네이티브가 아니라 앱 표면
 * (Menu와 같은 보더+명도 팝업)으로 렌더된다. options 배열이 아이템의 단일 출처이고,
 * items로도 전달해 Trigger의 Value가 원시 값 대신 라벨을 표시하게 한다.
 * 키보드(화살표·Enter·Esc·타이핑 검색)와 role=combobox/option 시맨틱은 Base UI가 제공한다.
 */
const trigger = cva(
  'flex cursor-pointer items-center justify-between gap-1 whitespace-nowrap rounded-md',
  {
    variants: {
      variant: {
        bordered: `${fieldSolid} px-1.5 ${fieldFocus}`,
        ghost: `bg-transparent px-1.5 ${ghostInteractive}`,
      },
      size: {
        sm: 'h-7 text-xs',
        md: 'h-8 text-xs',
      },
      /**
       * 폭 정책. 기본은 `auto` — 대부분의 셀렉트는 Field나 그리드가 폭을 정해 주므로
       * 내용에 따라 흔들리지 않는다(실측: 종류 406px, 모드·빈 값 199px로 컨테이너 고정).
       * `fixed`는 **다른 컨트롤과 같은 행에 있어 폭이 변하면 옆을 미는** 자리에만 준다.
       * 기본을 fixed로 두면 컨테이너가 정해 주던 셋까지 좁아져 아무도 요청하지 않은
       * 레이아웃 변경이 된다.
       *
       * 폭은 이 변형으로만 정한다 — 이 저장소는 className을 병합하지 않고 덧붙이므로
       * (`input.tsx` 주석 참고, tailwind-merge 없음) 호출자가 `w-*`를 className으로
       * 넘기면 두 폭 클래스가 함께 남아 CSS 소스 순서가 승자를 정한다. 다른 폭이
       * 필요하면 여기 변형을 늘린다.
       */
      width: {
        auto: '',
        fixed: selectFixedWidth,
      },
    },
    defaultVariants: { variant: 'bordered', size: 'sm', width: 'auto' },
  },
);

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

/** 값 타입 T가 현재 값·옵션·콜백에 일관 적용된다 — 호출부가 도메인 union을 그대로 쓴다. */
export interface SelectProps<T extends string> extends VariantProps<typeof trigger> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  'aria-label'?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function Select<T extends string>({
  variant,
  size,
  width,
  className,
  value,
  onValueChange,
  options,
  disabled,
  id,
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  const reduce = useReducedMotion();
  return (
    <BaseSelect.Root
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      disabled={disabled}
    >
      <BaseSelect.Trigger id={id} aria-label={ariaLabel} className={trigger({ variant, size, width, className })}>
        <BaseSelect.Value className="truncate" />
        <BaseSelect.Icon className="flex shrink-0 text-zinc-400">
          <ChevronDown size={12} strokeWidth={1.75} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        {/*
          `alignItemWithTrigger={false}` — Base UI의 기본값은 true이고, 그때는 **선택된
          항목이 트리거 위에 겹치도록** 팝업 전체를 끌어올린다(macOS 네이티브 셀렉트 방식).
          그 모드에서는 `side`·`align`·`sideOffset`이 무시되므로 팝업이 트리거를 가리고
          좌우도 항목 안쪽 여백만큼 밀려 보인다.

          이 앱의 다른 팝업(Menu·Autocomplete)은 전부 앵커 아래로 떨어지는 드롭다운이다.
          셀렉트만 다른 규칙을 쓰면 같은 표면이 자리마다 다르게 움직인다.
        */}
        <BaseSelect.Positioner
          side="bottom"
          align="start"
          alignItemWithTrigger={false}
          sideOffset={4}
          // 팝업 셸이 760×580으로 작아, 아래로 열리면 목록이 뷰포트를 넘길 수 있다.
          // 가장자리에 여백을 남겨 뒤집힘·밀림 판정이 화면에 붙기 전에 일어나게 한다.
          collisionPadding={8}
          className={popupPositioner}
        >
          {/*
            열림/닫힘 — 열릴 때 트리거 쪽(위)에서 아래로 내려오고, 닫힐 때 위로 접힌다.
            Base UI가 첫 프레임에 `data-starting-style`, 마지막 프레임에 `data-ending-style`을
            붙이므로 그 두 지점만 "위 + 투명"으로 잡으면 나머지는 전이가 잇는다.

            길이·곡선은 CSS 변수로 받는다 — Base UI가 Popup의 인라인 `style`을 덮어써서
            여기서 직접 줄 수 없다(실측). 변수는 MotionProvider가 문서 루트에 올린다.

            열림만 오버슈트가 있는 spring 곡선이고 닫힘은 평범한 ease-out이다 — 사라지는
            것이 되돌아오는 인상은 어색하다. `[data-ending-style]` 수식어가 특이도에서
            이겨 닫힐 때만 곡선을 갈아끼운다.

            reduced-motion이면 전이 클래스를 아예 붙이지 않는다 — 부재가 계약이다
            (ADR 0012 경계).
          */}
          {/*
            `--available-height`로 상한을 잡고 넘치면 팝업 안에서 스크롤한다. 없으면
            옵션이 많거나 트리거가 아래쪽에 있을 때 목록이 화면 밖으로 나가고, 그때
            floating-ui가 계속 자리를 다시 잡느라 팝업이 멎지 않는다(실측).
          */}
          <BaseSelect.Popup
            className={`max-h-[var(--available-height)] overflow-y-auto ${popupAnchored} ${
              reduce
                ? ''
                : 'transition-[opacity,translate] duration-[var(--popup-fade)] ease-[var(--popup-ease)] data-[ending-style]:-translate-y-1 data-[ending-style]:opacity-0 data-[ending-style]:ease-out data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0'
            }`}
          >
            {options.map((option) => (
              <BaseSelect.Item
                key={option.value}
                value={option.value}
                className={`justify-between gap-2 ${popupItemText}`}
              >
                <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                <BaseSelect.ItemIndicator className="flex text-blue-600 dark:text-blue-400">
                  <Check size={12} strokeWidth={1.75} />
                </BaseSelect.ItemIndicator>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
