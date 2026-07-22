import { Toast } from '@base-ui-components/react/toast';
import type { ReactNode } from 'react';

/**
 * 토스트 (ADR 0011) — Provider가 상태를 들고, Region이 목록을 렌더한다.
 * 삭제 실행 취소(ui-refine 07)처럼 "방금 한 동작"에 대한 즉시 되돌림 액션을 띄운다.
 * 되돌림 콜백은 add({ actionProps: { onClick } })로 넘긴다. 수동 닫기 버튼은 두지
 * 않는다 — 자동 소멸(기본 수명)과 Undo 클릭이 닫음을 겸한다.
 */
export const useToastManager = Toast.useToastManager;

/** 토스트 목록 렌더 — Provider 하위에 한 번 둔다(양 표면 셸 공용). */
function ToastRegion() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed right-4 bottom-4 z-50 flex w-72 flex-col gap-2">
        {toasts.map((toast) => (
          // 인앱 팝업(메뉴·셀렉트)은 무그림자(ADR 0004)지만, 토스트는 임의의 페이지
          // 콘텐츠 위에 뜨는 전역 알림이라 명도만으로 분리되지 않는다 — 그림자로 띄운다.
          <Toast.Root
            key={toast.id}
            toast={toast}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg data-[ending]:opacity-0 data-[starting]:opacity-0 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <Toast.Title className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200" />
            {toast.actionProps && (
              <Toast.Action className="shrink-0 rounded-md px-2 py-1 font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950">
                {toast.data && typeof toast.data === 'object' && 'actionLabel' in toast.data
                  ? String((toast.data as { actionLabel: unknown }).actionLabel)
                  : undefined}
              </Toast.Action>
            )}
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

/** 앱 셸을 감싸는 토스트 Provider — Region을 함께 렌더해 어디서든 add()를 쓸 수 있게 한다. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider>
      {children}
      <ToastRegion />
    </Toast.Provider>
  );
}
