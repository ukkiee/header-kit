import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { RequestHeaderModification } from '@/core/schema';
import { HeaderRow } from './HeaderRow';

const meta = {
  title: 'Popup/HeaderRow',
  component: HeaderRow,
} satisfies Meta<typeof HeaderRow>;

export default meta;
type Story = StoryObj<typeof meta>;

function InteractiveHeaderRow({ initial }: { initial: RequestHeaderModification }) {
  const [modification, setModification] = useState(initial);
  return (
    <HeaderRow
      modification={modification}
      onChange={setModification}
      onRemove={() => setModification({ ...modification, enabled: false })}
    />
  );
}

export const Filled: Story = {
  args: {
    modification: { id: 'm1', name: 'X-Debug', value: 'on', enabled: true },
    onChange: () => {},
    onRemove: () => {},
  },
  render: (args) => <InteractiveHeaderRow initial={args.modification} />,
};

export const Empty: Story = {
  args: {
    modification: { id: 'm2', name: '', value: '', enabled: true },
    onChange: () => {},
    onRemove: () => {},
  },
  render: (args) => <InteractiveHeaderRow initial={args.modification} />,
};
