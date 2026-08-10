import { Dialog } from '@base-ui/react/dialog';
import { Maximize2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/ui/press-button';
import { TextArea } from '@/ui/text-field';
import { format } from '@/core/i18n';
import { useT } from './i18n-context';

export interface LargeEditorProps {
  title: string;
  value: string;
  onCommit: (next: string) => void;
  /** 트리거 버튼에 표시할 라벨. */
  triggerLabel?: ReactNode;
}

/** 긴 regex·헤더 값을 넓은 다이얼로그에서 편집한다 (탭 앱·팝업 공용). */
export function LargeEditor({ title, value, onCommit, triggerLabel = <Maximize2 size={14} strokeWidth={1.75} /> }: LargeEditorProps) {
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
          <Button variant="ghost" size="sm" aria-label={format(t('ariaOpenLargeEditor'), { title })}>
            {triggerLabel}
          </Button>
        }
      />
      {/*
        열림·닫힘 모션은 **global.css가 소유한다** — 여기 className이 아니라. Select 팝업과
        같은 사정이다(ADR 0014의 경계): 마운트를 Base UI가 쥐고 있어 motion으로 감쌀 수 없고,
        Tailwind 임의값(`duration-[var(--popup-fade)]`)은 v4 스캐너가 유틸로 내주지 않아
        클래스만 남고 스타일이 사라진다. 그래서 `data-slot`으로 자리만 표시하고 전이는
        CSS 규칙이 건다 — 길이·곡선은 MotionProvider가 올린 모션 토큰에서 온다.
      */}
      <Dialog.Portal>
        <Dialog.Backdrop data-slot="dialog-backdrop" className="fixed inset-0 bg-black/40" />
        <Dialog.Popup
          data-slot="dialog-popup"
          className="fixed left-1/2 top-1/2 flex w-[min(90vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg bg-white p-4 shadow-xl dark:bg-zinc-900"
        >
          <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
          <TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={title}
            rows={12}
            font="mono"
          />
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" size="sm">{t('cancel')}</Button>} />
            <Dialog.Close
              render={<Button size="sm" aria-label={t('ariaSaveLargeEditor')}>{t('save')}</Button>}
              onClick={() => onCommit(draft)}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
