import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { CspModification, Modification } from '@/core/schema';
import { CspRow } from './csp-row';

const meta = { title: 'Popup/CspRow', component: CspRow } satisfies Meta<typeof CspRow>;
export default meta;
type Story = StoryObj<typeof meta>;

function Interactive({ initial }: { initial: CspModification }) {
  const [mod, setMod] = useState<CspModification>(initial);
  return <CspRow modification={mod} onChange={(m: Modification) => setMod(m as CspModification)} onRemove={() => {}} />;
}

export const Default: Story = {
  args: {
    modification: {
      kind: 'csp',
      id: 'm1',
      directives: [
        { name: 'default-src', value: "'self'" },
        { name: 'img-src', value: 'https: data:' },
      ],
      comment: '',
      enabled: true,
    },
    onChange: () => {},
    onRemove: () => {},
  },
  render: (args) => <Interactive initial={args.modification} />,
};
