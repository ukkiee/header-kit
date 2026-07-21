import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { Modification, RedirectModification } from '@/core/schema';
import { RedirectRow } from './redirect-row';

const meta = { title: 'Popup/RedirectRow', component: RedirectRow } satisfies Meta<typeof RedirectRow>;
export default meta;
type Story = StoryObj<typeof meta>;

function Interactive({
  initial,
  initiallyExpanded = false,
}: {
  initial: RedirectModification;
  initiallyExpanded?: boolean;
}) {
  const [mod, setMod] = useState<RedirectModification>(initial);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  return (
    <RedirectRow
      modification={mod}
      onChange={(m: Modification) => setMod(m as RedirectModification)}
      onRemove={() => {}}
      expanded={expanded}
      onToggleExpanded={() => setExpanded((v) => !v)}
    />
  );
}

const sample: RedirectModification = {
  kind: 'redirect',
  id: 'm1',
  pattern: '^https://prod\\.example\\.com/(.*)',
  substitution: 'http://localhost:3000/\\1',
  comment: '',
  enabled: true,
};

export const Collapsed: Story = {
  args: { modification: sample, onChange: () => {}, onRemove: () => {} },
  render: (args) => <Interactive initial={args.modification} />,
};

export const Expanded: Story = {
  args: { modification: sample, onChange: () => {}, onRemove: () => {} },
  render: (args) => <Interactive initial={args.modification} initiallyExpanded />,
};
