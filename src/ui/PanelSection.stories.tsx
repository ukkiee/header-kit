import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { PanelSection } from './PanelSection';

const meta = {
  title: 'UI/PanelSection',
  component: PanelSection,
} satisfies Meta<typeof PanelSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithToggle: Story = {
  args: {
    title: 'Backups',
    actions: (
      <Button variant="ghost" size="sm">
        Show
      </Button>
    ),
    children: <p className="text-xs text-zinc-400">No backups yet.</p>,
  },
};
