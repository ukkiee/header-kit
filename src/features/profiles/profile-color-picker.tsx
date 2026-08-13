import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerHueSlider,
  ColorPickerInput,
} from '@/ui/color-picker';

/**
 * 팔레트 **밖의** 색을 고르는 자리 (ADR 0017 재개정) — 색면 + 색상 슬라이더 + hex 입력.
 *
 * **이 파일이 지연 청크의 뿌리다.** 벤더링한 컬러피커(`ui/color-picker.tsx`)는 소스만 43KB고
 * Base UI slider·popover까지 함께 끌고 오는데, 그것을 보는 사람은 프로필을 고치는 중인 사람
 * 하나뿐이다. 팝업 첫 페인트에 들어갈 이유가 없다 — `bundle-gate`의 `MUST_BE_DEFERRED`가
 * 이 청크 이름을 물고 있어, 누군가 정적 import로 되돌리면 크기 한도와 무관하게 FAIL이다.
 *
 * **기본 내보내기인 이유**: `React.lazy`가 그것을 요구한다. 이 파일에서 나가는 것이 하나뿐이라
 * 이름을 잃는 대가도 없다.
 *
 * 값은 **`#rrggbb`로만 오간다**(`format="hex"`). 그 위에서 `normalizeProfileColor`가 한 번 더
 * 접지만, 여기서부터 hex로 두면 사용자가 입력칸에 친 표기와 저장되는 표기가 갈라지지 않는다.
 */
export default function ProfileColorPicker({
  defaultValue,
  onValueChange,
}: {
  /**
   * 처음 보여 줄 색 — **마운트에서 한 번만** 읽힌다(제어하지 않는다).
   *
   * `value`로 제어하면 값을 밀어 넣을 때마다 피커가 **echo를 두 번** 쏜다: 하나는 정확한
   * hex이고 하나는 HSV를 거친 **손실 왕복**이다(`color-picker.tsx`의 `valueProp` 효과가
   * `setColor`와 `setHsv`를 잇달아 부르고 둘 다 `onValueChange`를 낸다). 그래서 팔레트에서
   * `#d97706`을 고르면 `#d97707`이 저장됐다 — 실측이고, 그러면 팔레트의 선택 표시도
   * 어느 칸에도 서지 않는다.
   *
   * 팔레트가 색을 옮길 때는 부르는 쪽이 `key`로 **다시 마운트**한다. 마운트는 초기 상태를
   * 그대로 담고 아무것도 방출하지 않으므로 왕복이 끼어들 자리가 없다.
   */
  defaultValue: string;
  /**
   * **드래그 중에도 계속 불린다.** 그래서 부르는 쪽은 이 값을 명령으로 바로 보내지 않고
   * 초안으로 받는다 — 색면을 한 번 훑는 동안 dNR 재컴파일과 백업 스냅샷이 수십 번 예약되는
   * 것이 그러지 않는 이유다(`profile-color-field`의 커밋 주석).
   */
  onValueChange: (value: string) => void;
}) {
  return (
    <ColorPicker inline defaultValue={defaultValue} format="hex" onValueChange={onValueChange}>
      {/*
        `ColorPickerContent`의 inline 분기는 `w-[340px]`을 못박는다 — 이 팝오버는 프로필 열에
        붙어 서므로 폭을 호출부가 되돌린다(ADR 0014의 "호출부가 더 안다").
      */}
      <ColorPickerContent className="w-full gap-2 p-0">
        <ColorPickerArea className="h-24" />
        <ColorPickerHueSlider />
        {/* 알파는 받지 않는다 — 저장 표기가 6자리 hex라 8자리는 정규화에서 거절된다. */}
        <ColorPickerInput withoutAlpha />
      </ColorPickerContent>
    </ColorPicker>
  );
}
