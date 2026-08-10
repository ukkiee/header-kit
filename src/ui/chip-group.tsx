import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';

/**
 * 토글 칩 그룹 — Base UI Toggle/ToggleGroup 기반 (ADR 0011). 선택 상태는 accent,
 * aria-pressed·roving focus는 Base UI가 제공한다. 캡션은 이 컴포넌트 밖의 span이고
 * 그룹은 aria-label로 이름을 갖는다 — 라벨 요소가 컨트롤을 감싸지 않으므로
 * 라벨 호버가 첫 칩에 전파되던 버그 구조가 없다.
 *
 * **안 고른 칩에도 경계가 있다.** 채움(`bg-secondary`)만으로 칩을 세우던 시절에는, 이 칩들이
 * 실제로 놓이는 자리 — 규칙 폼 본문 — 이 같은 `bg-secondary` 면이라 칩과 배경이 같은 색이
 * 됐다. 화면에는 낱말만 떠 있고 누를 수 있는 것으로 보이지 않았다. 경계선은 그 면 차이와
 * 무관하게 칩의 윤곽을 그린다.
 *
 * 색은 `--input`이다 — `--border`는 **장식 구분선**용이라 대비를 지지 않는데(라이트
 * #e2e2e6 ≈ 1.24:1) 칩은 눌러 고르는 상호작용 요소다(비텍스트 3:1). 프로필 스와치·필드
 * 경계가 같은 이유로 같은 토큰을 쓴다.
 *
 * 고른 칩도 **같은 두께의** 경계를 갖는다(색만 accent로). 한쪽에만 두면 고를 때마다 칩이
 * 2px씩 커졌다 작아져 줄 전체가 흔들린다.
 */
const chipClass =
  'cursor-pointer whitespace-nowrap rounded-full border border-input px-1.5 py-0.5 text-[10px] transition-colors bg-secondary text-muted-foreground hover:bg-accent data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground data-[pressed]:hover:bg-primary dark:data-[pressed]:hover:bg-primary';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export interface ChipGroupProps<T extends string> {
  /** 선택된 값들 — ToggleGroup의 value로 그대로 흐른다. */
  values: readonly T[];
  options: readonly ChipOption<T>[];
  onValuesChange: (values: T[]) => void;
  'aria-label'?: string;
}

export function ChipGroup<T extends string>({
  values,
  options,
  onValuesChange,
  'aria-label': ariaLabel,
}: ChipGroupProps<T>) {
  return (
    <ToggleGroup
      multiple
      value={values}
      onValueChange={(next) => onValuesChange(next as T[])}
      aria-label={ariaLabel}
      className={groupClass}
    >
      <Chips options={options} />
    </ToggleGroup>
  );
}

const groupClass = 'flex flex-wrap gap-1';

/** 두 그룹이 공유하는 칩 목록 — 선택 규칙만 다르고 칩 자체는 같은 것이어야 한다. */
function Chips<T extends string>({ options }: { options: readonly ChipOption<T>[] }) {
  return options.map((option) => (
    <Toggle key={option.value} value={option.value} className={chipClass}>
      {option.label}
    </Toggle>
  ));
}

export interface ChoiceChipsProps<T extends string> {
  /** 선택된 값 하나 — 비어 있는 상태가 없다. */
  value: T;
  options: readonly ChipOption<T>[];
  onValueChange: (value: T) => void;
  'aria-label'?: string;
}

/**
 * 택1 칩 그룹 — 같은 칩 문법이지만 **항상 정확히 하나**가 선택된다 (티켓 05의 테마 선택).
 *
 * ChipGroup(다중)과 나눠 둔 이유는 **빈 선택** 하나다. 조건 필터는 "아무것도 안 고름"이
 * 뜻을 갖지만 테마 같은 택1 설정에는 그런 상태가 없는데, 다중 그룹으로 흉내 내면 켜져 있는
 * 칩을 다시 눌러 선택이 비는 경로가 생긴다 — 그때 무엇을 그릴지 정해진 답이 없다.
 *
 * (접근성 노출은 두 그룹이 같다 — Base UI는 어느 쪽이든 `aria-pressed` 버튼을 낸다.
 * radio 시맨틱이 필요해지면 그건 이 칩 문법이 아니라 RadioGroup으로 갈 일이다.)
 */
export function ChoiceChips<T extends string>({
  value,
  options,
  onValueChange,
  'aria-label': ariaLabel,
}: ChoiceChipsProps<T>) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        // 켜져 있는 칩을 다시 누르면 Base UI가 빈 배열을 준다 — 그건 선택 해제가 아니라
        // "같은 것을 다시 골랐다"이므로 현재 값을 지킨다.
        const picked = (next as T[])[0];
        if (picked !== undefined && picked !== value) onValueChange(picked);
      }}
      aria-label={ariaLabel}
      className={groupClass}
    >
      <Chips options={options} />
    </ToggleGroup>
  );
}
