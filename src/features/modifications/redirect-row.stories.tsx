import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { Modification, RedirectModification } from '@/core/schema';
import { RedirectRow } from './redirect-row';

const meta = { title: 'Popup/RedirectRow', component: RedirectRow } satisfies Meta<typeof RedirectRow>;
export default meta;
type Story = StoryObj<typeof meta>;

function Interactive({ initial }: { initial: RedirectModification }) {
  const [mod, setMod] = useState<RedirectModification>(initial);
  return (
    <RedirectRow
      modification={mod}
      onChange={(m: Modification) => setMod(m as RedirectModification)}
      onRemove={() => {}}
    />
  );
}

export const Default: Story = {
  args: {
    modification: {
      kind: 'redirect',
      id: 'm1',
      pattern: '^https://prod\\.example\\.com/(.*)',
      substitution: 'http://localhost:3000/\\1',
      comment: '',
      enabled: true,
    },
    onChange: () => {},
    onRemove: () => {},
  },
  render: (args) => <Interactive initial={args.modification} />,
};
