import { Switch } from '@base-ui-components/react/switch';
import type { ComponentProps } from 'react';

export type ToggleSwitchProps = ComponentProps<typeof Switch.Root>;

/** Base UI Switch 래퍼 — accent(blue-600)를 Button/Chip/Checkbox와 통일한다. */
export function ToggleSwitch(props: ToggleSwitchProps) {
  return (
    <Switch.Root
      // cursor-pointer — 다른 버튼 프리미티브(Button·IconButton·아코디언 헤더)가 전부
      // 갖고 있는데 스위치만 기본 커서라 누를 수 있는 것으로 안 보였다.
      className="flex h-5 w-9 shrink-0 cursor-pointer rounded-full bg-zinc-300 p-0.5 transition-colors disabled:cursor-default data-[checked]:bg-blue-600 dark:bg-zinc-700"
      {...props}
    >
      <Switch.Thumb className="size-4 rounded-full bg-white transition-transform data-[checked]:translate-x-4" />
    </Switch.Root>
  );
}
