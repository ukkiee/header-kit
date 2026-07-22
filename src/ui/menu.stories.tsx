import type { Meta, StoryObj } from '@storybook/react-vite';
import { Ellipsis } from 'lucide-react';
import { Button } from './button';
import { Menu, MenuItem, MenuPopup, MenuTrigger } from './menu';

const meta = {
  title: 'UI/Menu',
  component: Menu,
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProfileActions: Story = {
  render: () => (
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="sm" aria-label="Menu" />}><Ellipsis size={16} strokeWidth={1.75} /></MenuTrigger>
      <MenuPopup>
        <MenuItem disabled>Move up</MenuItem>
        <MenuItem>Move down</MenuItem>
        <MenuItem>Duplicate</MenuItem>
        <MenuItem tone="danger">Delete</MenuItem>
      </MenuPopup>
    </Menu>
  ),
};
