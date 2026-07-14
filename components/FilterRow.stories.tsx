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

const samplePickerOptions = {
  tabs: [
    { tabId: 1, label: 'Dashboard — app.example.com' },
    { tabId: 2, label: 'Docs — docs.example.com' },
  ],
  groups: [{ groupId: 5, label: 'Group 5 (2 tabs)' }],
  windows: [{ windowId: 10, label: 'Window 10 (3 tabs)' }],
};

function renderWithPicker(args: { filter: Filter }) {
  return (
    <FilterRow
      filter={args.filter}
      onChange={() => {}}
      onRemove={() => {}}
      pickerOptions={samplePickerOptions}
    />
  );
}

export const Tab: Story = {
  args: {
    filter: { kind: 'tab', id: 'f6', enabled: true, tabId: 2 },
    onChange: () => {},
    onRemove: () => {},
  },
  render: renderWithPicker,
};

export const TabGroup: Story = {
  args: {
    filter: { kind: 'tab-group', id: 'f7', enabled: true, groupId: 5 },
    onChange: () => {},
    onRemove: () => {},
  },
  render: renderWithPicker,
};

export const TabDomain: Story = {
  args: {
    filter: { kind: 'tab-domain', id: 'f8', enabled: true, domain: 'example.com' },
    onChange: () => {},
    onRemove: () => {},
  },
  render,
};

export const Time: Story = {
  args: {
    filter: { kind: 'time', id: 'f9', enabled: true, expiresAt: 1789500000000 },
    onChange: () => {},
    onRemove: () => {},
  },
  render,
};
