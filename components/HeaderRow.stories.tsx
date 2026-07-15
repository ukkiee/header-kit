import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { Modification } from '@/core/schema';
import { HeaderRow } from './HeaderRow';

const meta = {
  title: 'Popup/HeaderRow',
  component: HeaderRow,
} satisfies Meta<typeof HeaderRow>;

export default meta;
type Story = StoryObj<typeof meta>;

type ValueModification = Extract<Modification, { value: string }>;

function InteractiveHeaderRow({ initial }: { initial: ValueModification }) {
  const [modification, setModification] = useState<ValueModification>(initial);
  return (
    <HeaderRow
      modification={modification}
      onChange={(next) => setModification(next as ValueModification)}
      onRemove={() => setModification({ ...modification, enabled: false })}
    />
  );
}

export const Filled: Story = {
  args: {
    modification: { kind: 'request-header', id: 'm1', name: 'X-Debug', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
    onChange: () => {},
    onRemove: () => {},
  },
  render: (args) => <InteractiveHeaderRow initial={args.modification} />,
};

export const Empty: Story = {
  args: {
    modification: { kind: 'request-header', id: 'm2', name: '', value: '', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
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
      mode: 'override',
      emptyMeans: 'remove',
      comment: '',
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

export const ResponseHeader: Story = {
  args: {
    modification: {
      kind: 'response-header',
      id: 'm4',
      name: 'Access-Control-Allow-Origin',
      value: '*',
      mode: 'override',
      emptyMeans: 'remove',
      comment: 'loosen CORS for local dev',
      enabled: true,
    },
    onChange: () => {},
    onRemove: () => {},
  },
  render: (args) => <InteractiveHeaderRow initial={args.modification} />,
};

// 허용 목록 헤더(Accept) — Append 칩이 노출된다.
export const AppendAllowedRequest: Story = {
  args: {
    modification: {
      kind: 'request-header',
      id: 'm5',
      name: 'Accept',
      value: 'application/json',
      mode: 'append',
      emptyMeans: 'remove',
      comment: '',
      enabled: true,
    },
    onChange: () => {},
    onRemove: () => {},
  },
  render: (args) => <InteractiveHeaderRow initial={args.modification} />,
};

// 허용 목록 밖 요청 헤더 — Append 칩이 숨겨진다.
export const AppendHiddenRequest: Story = {
  args: {
    modification: {
      kind: 'request-header',
      id: 'm6',
      name: 'X-Custom-Header',
      value: 'v',
      mode: 'override',
      emptyMeans: 'remove',
      comment: '',
      enabled: true,
    },
    onChange: () => {},
    onRemove: () => {},
  },
  render: (args) => <InteractiveHeaderRow initial={args.modification} />,
};

// 빈 값 — remove vs send-empty 칩이 노출된다.
export const EmptyValueToggle: Story = {
  args: {
    modification: {
      kind: 'request-header',
      id: 'm7',
      name: 'X-Maybe-Gone',
      value: '',
      mode: 'override',
      emptyMeans: 'remove',
      comment: '',
      enabled: true,
    },
    onChange: () => {},
    onRemove: () => {},
  },
  render: (args) => <InteractiveHeaderRow initial={args.modification} />,
};
