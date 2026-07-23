import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollArea } from './scroll-area';

const meta = {
  title: 'UI/ScrollArea',
  component: ScrollArea,
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

const rows = (count: number, label: (i: number) => string) =>
  Array.from({ length: count }, (_, i) => (
    <div key={i} className="truncate rounded border border-zinc-200 p-2 text-xs dark:border-zinc-800">
      {label(i)}
    </div>
  ));

export const Vertical: Story = {
  args: {
    className: 'h-56 w-56 rounded-md border border-zinc-200 dark:border-zinc-800',
    viewportClassName: 'flex flex-col gap-2 p-3',
    children: rows(20, (i) => `항목 ${i + 1}`),
  },
};

/** 긴 이름은 잘리고 가로로 늘어나지 않는다 — Content(min-width: fit-content)를 안 쓰는 이유. */
export const LongNamesTruncate: Story = {
  args: {
    className: 'h-56 w-56 rounded-md border border-zinc-200 dark:border-zinc-800',
    viewportClassName: 'flex flex-col gap-2 p-3',
    children: rows(12, (i) =>
      i % 2
        ? `아주 길고 긴 한국어 프로필 이름 ${i} — 반드시 잘려야 한다`
        : `An extremely long English profile name ${i} that must truncate`,
    ),
  },
};
