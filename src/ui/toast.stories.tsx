import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { ToastProvider, useToastManager } from './toast';

const meta = {
  title: 'UI/Toast',
  component: ToastProvider,
} satisfies Meta<typeof ToastProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

function UndoDemo() {
  const toast = useToastManager();
  return (
    <Button
      size="sm"
      onClick={() =>
        toast.add({
          title: 'Rule deleted',
          data: { actionLabel: 'Undo' },
          actionProps: { onClick: () => {} },
        })
      }
    >
      Delete rule
    </Button>
  );
}

/** 삭제 → Undo 액션이 달린 토스트. 버튼을 눌러 띄운다. */
export const UndoToast: Story = {
  args: { children: null },
  render: () => (
    <ToastProvider>
      <UndoDemo />
    </ToastProvider>
  ),
};
