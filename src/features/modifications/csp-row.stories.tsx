import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { CspModification, Modification } from '@/core/schema';
import { CspRow } from './csp-row';

const meta = { title: 'Popup/CspRow', component: CspRow } satisfies Meta<typeof CspRow>;
export default meta;
type Story = StoryObj<typeof meta>;

function Interactive({
  initial,
  initiallyExpanded = false,
}: {
  initial: CspModification;
  initiallyExpanded?: boolean;
}) {
  const [mod, setMod] = useState<CspModification>(initial);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  return (
    <CspRow
      modification={mod}
      onChange={(m: Modification) => setMod(m as CspModification)}
      onRemove={() => {}}
      expanded={expanded}
      onToggleExpanded={() => setExpanded((v) => !v)}
    />
  );
}

const sample: CspModification = {
  kind: 'csp',
  id: 'm1',
  directives: [
    { name: 'default-src', value: "'self'" },
    { name: 'img-src', value: 'https: data:' },
  ],
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
