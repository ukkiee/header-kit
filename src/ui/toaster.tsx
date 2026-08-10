import type { ReactNode } from 'react';
import {
  Toast,
  ToastAction,
  ToastContent,
  ToastPortal,
  ToastProvider as ShadcnToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager,
} from '@/ui/toast';

/**
 * 토스트 셸 — shadcn Toast 부품을 이 앱의 규약대로 조합한다. shadcn 소스(`toast.tsx`)는
 * 손대지 않는다(ADR 0014).
 *
 * shadcn이 함께 주는 `Toaster`를 그대로 쓰지 못하는 이유는 두 가지다.
 * 1. **액션 라벨**: shadcn `ToastList`는 `<ToastAction />`을 자식 없이 렌더해 버튼에
 *    글자가 없다. 이 앱은 삭제 실행 취소(ui-refine 07)에서 "실행 취소"를 눌러야 하고,
 *    라벨은 로케일마다 다르므로 `add({ data: { actionLabel } })`로 넘겨 받는다.
 *    스모크 N20a가 이 버튼을 이름으로 찾는다.
 * 2. **닫기 버튼 없음**: shadcn은 항상 X를 붙이지만 이 앱은 두지 않는다 — 자동 소멸과
 *    실행 취소 클릭이 닫음을 겸한다(원래 toast 주석의 결정).
 *
 * `cursor-pointer`를 여기서 한 번 더 주는 이유: 앱의 버튼 커서는 `press-button`이 지는데
 * (Tailwind v4 preflight가 버튼을 기본 커서로 되돌렸다) shadcn `toast.tsx`는 그 조합을
 * 거치지 않고 shadcn `Button`을 직접 렌더한다. 이 앱이 손댈 수 있는 마지막 자리가 여기다.
 */
function AppToastList() {
  const { toasts } = useToastManager();
  return toasts.map((item) => (
    <Toast key={item.id} toast={item}>
      <ToastContent>
        <ToastTitle className="min-w-0 flex-1 truncate" />
        {item.actionProps && (
          <ToastAction className="cursor-pointer">{actionLabel(item.data)}</ToastAction>
        )}
      </ToastContent>
    </Toast>
  ));
}

/** add({ data: { actionLabel } })로 실린 라벨을 꺼낸다 — 없으면 버튼에 글자를 두지 않는다. */
function actionLabel(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'actionLabel' in data) {
    return String((data as { actionLabel: unknown }).actionLabel);
  }
  return undefined;
}

/**
 * 앱 셸을 감싸는 토스트 Provider — Viewport까지 함께 렌더해 어디서든 add()를 쓸 수 있게
 * 한다. 두 표면(팝업·탭)의 엔트리가 공유한다.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ShadcnToastProvider>
      {children}
      <ToastPortal>
        <ToastViewport>
          <AppToastList />
        </ToastViewport>
      </ToastPortal>
    </ShadcnToastProvider>
  );
}
