import { Switch } from '@base-ui-components/react/switch';
import type { ComponentProps } from 'react';

export type ToggleSwitchProps = ComponentProps<typeof Switch.Root>;

/** Base UI Switch 래퍼 — accent(blue-600)를 Button/Chip/Checkbox와 통일한다. */
export function ToggleSwitch(props: ToggleSwitchProps) {
  return (
    <Switch.Root
      className="flex h-5 w-9 shrink-0 rounded-full bg-zinc-300 p-0.5 transition-colors data-[checked]:bg-blue-600 dark:bg-zinc-700"
      {...props}
    >
      <Switch.Thumb className="size-4 rounded-full bg-white transition-transform data-[checked]:translate-x-4" />
    </Switch.Root>
  );
}
