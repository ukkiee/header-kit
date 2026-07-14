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
    modification: { kind: 'request-header', id: 'm1', name: 'X-Debug', value: 'on', enabled: true },
    onChange: () => {},
    onRemove: () => {},
  },
  render: (args) => <InteractiveHeaderRow initial={args.modification} />,
};

export const Empty: Story = {
  args: {
    modification: { kind: 'request-header', id: 'm2', name: '', value: '', enabled: true },
    onChange: () => {},
    onRemove: () => {},
  },
  render: (args) => <InteractiveHeaderRow initial={args.modification} />,
};

export const WithPlaceholder: Story = {
  args: {
    modification: {
      kind: 'request-header',
      id: 'm3',
      name: 'X-Trace-Id',
      value: 'req-{{uuid}}',
      enabled: true,
    },
    onChange: () => {},
    onRemove: () => {},
    materializedValue: 'req-4f1c2b3a-8e9d-4a5b-9c6d-7e8f9a0b1c2d',
  },
  render: (args) => (
    <HeaderRow
      modification={args.modification}
      onChange={() => {}}
      onRemove={() => {}}
      materializedValue={args.materializedValue}
    />
  ),
};
