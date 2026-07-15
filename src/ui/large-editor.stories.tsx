import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { LargeEditor } from './large-editor';

const meta = {
  title: 'Popup/LargeEditor',
  component: LargeEditor,
} satisfies Meta<typeof LargeEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

function InteractiveLargeEditor({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex items-center gap-2">
      <code className="text-xs">{value.slice(0, 40) || '(empty)'}</code>
      <LargeEditor title="Value — X-Long-Header" value={value} onCommit={setValue} />
    </div>
  );
}

export const Default: Story = {
  args: {
    title: 'Value — X-Long-Header',
    value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'.repeat(4),
    onCommit: () => {},
  },
  render: (args) => <InteractiveLargeEditor initial={args.value} />,
};
