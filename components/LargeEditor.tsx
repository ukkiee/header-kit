import { Dialog } from '@base-ui-components/react/dialog';
import { useState } from 'react';
import { Button } from './Button';
import { useT } from './i18n-context';

export interface LargeEditorProps {
  title: string;
  value: string;
  onCommit: (next: string) => void;
  /** 트리거 버튼에 표시할 라벨. */
  triggerLabel?: string;
}

/** 긴 regex·CSP·헤더 값을 넓은 다이얼로그에서 편집한다 (탭 앱·팝업 공용). */
export function LargeEditor({ title, value, onCommit, triggerLabel = 'Expand' }: LargeEditorProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(value); // 열 때마다 현재 값으로 초안을 맞춘다
        setOpen(next);
      }}
    >
      <Dialog.Trigger
        render={
          <Button variant="ghost" size="sm" aria-label={`${title} — open large editor`}>
            {triggerLabel}
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 flex w-[min(90vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg bg-white p-4 shadow-xl dark:bg-zinc-900">
          <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={title}
            rows={12}
            className="rounded-md border border-zinc-300 bg-white p-2 font-mono text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" size="sm">{t('cancel')}</Button>} />
            <Dialog.Close
              render={<Button size="sm" aria-label="Save large editor">{t('save')}</Button>}
              onClick={() => onCommit(draft)}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
