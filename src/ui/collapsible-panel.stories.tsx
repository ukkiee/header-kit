import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { CollapsiblePanel } from './collapsible-panel';

const meta = {
  title: 'UI/CollapsiblePanel',
} satisfies Meta;

export default meta;
type Story = StoryObj;

function Interactive() {
  const [open, setOpen] = useState(true);
  return (
    <CollapsiblePanel
      title="Backups"
      open={open}
      onOpenChange={setOpen}
      toggleAriaLabel="Toggle backups"
    >
      <p className="text-xs text-zinc-400">No backups yet.</p>
    </CollapsiblePanel>
  );
}

export const Default: Story = { render: () => <Interactive /> };
