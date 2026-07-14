import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { Filter } from '@/core/schema';
import { FilterRow } from './FilterRow';

const meta = {
  title: 'Popup/FilterRow',
  component: FilterRow,
} satisfies Meta<typeof FilterRow>;

export default meta;
type Story = StoryObj<typeof meta>;

function InteractiveFilterRow({ initial }: { initial: Filter }) {
  const [filter, setFilter] = useState(initial);
  return (
    <FilterRow
      filter={filter}
      onChange={setFilter}
      onRemove={() => setFilter({ ...filter, enabled: false })}
    />
  );
}

const render = (args: { filter: Filter }) => <InteractiveFilterRow initial={args.filter} />;

export const Url: Story = {
  args: {
    filter: { kind: 'url', id: 'f1', enabled: true, pattern: 'api\\.example\\.com/v1' },
    onChange: () => {},
    onRemove: () => {},
  },
  render,
};

export const ExcludeUrl: Story = {
  args: {
    filter: { kind: 'exclude-url', id: 'f2', enabled: true, pattern: '\\.png$' },
    onChange: () => {},
    onRemove: () => {},
  },
  render,
};

export const ResourceType: Story = {
  args: {
    filter: {
      kind: 'resource-type',
      id: 'f3',
      enabled: true,
      resourceTypes: ['xmlhttprequest', 'script'],
    },
    onChange: () => {},
    onRemove: () => {},
  },
  render,
};

export const RequestMethod: Story = {
  args: {
    filter: { kind: 'request-method', id: 'f4', enabled: true, methods: ['get', 'post'] },
    onChange: () => {},
    onRemove: () => {},
  },
  render,
};

export const InitiatorDomain: Story = {
  args: {
    filter: { kind: 'initiator-domain', id: 'f5', enabled: true, domain: 'dev.example.com' },
    onChange: () => {},
    onRemove: () => {},
  },
  render,
};
