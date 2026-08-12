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
  value,
  onValueChange,
}: {
  value: string;
  /**
   * **드래그 중에도 계속 불린다.** 그래서 부르는 쪽은 이 값을 명령으로 바로 보내지 않고
   * 초안으로 받는다 — 색면을 한 번 훑는 동안 dNR 재컴파일과 백업 스냅샷이 수십 번 예약되는
   * 것이 그러지 않는 이유다(`profile-color-field`의 커밋 주석).
   */
  onValueChange: (value: string) => void;
}) {
  return (
    <ColorPicker inline value={value} format="hex" onValueChange={onValueChange}>
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
