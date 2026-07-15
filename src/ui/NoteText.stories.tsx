import type { Meta, StoryObj } from '@storybook/react-vite';
import { NoteText } from './NoteText';

const meta = {
  title: 'UI/NoteText',
  component: NoteText,
} satisfies Meta<typeof NoteText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Note: Story = { args: { children: 'The profile turns off automatically at this time.' } };
export const RowIndent: Story = { args: { indent: 'row', children: 'Redirect capture note.' } };
