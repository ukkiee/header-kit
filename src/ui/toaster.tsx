import type { ReactNode } from 'react';
import { Button } from '@/ui/press-button';
import {
  Toast,
  ToastAction,
  ToastContent,
  ToastPortal,
  ToastProvider as ShadcnToastProvider,
  ToastClose,
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
/**
 * 이 앱의 토스트 한 벌 — **작고, 초록이다.**
 *
 * shadcn 기본은 384px 폭에 16px 안쪽 여백, 24px 모서리, 팝오버 면이라 760×580 팝업에서
 * 화면의 절반을 덮으면서도 배경과 같은 색이라 눈에 걸리지 않았다. 규칙 삭제처럼 **이미
 * 일어난 일**을 알리는 쪽지는 작아야 하고, 대신 색으로 존재를 말해야 한다.
 *
 * **면은 `item.type`이 정한다.** 한때 조건 없이 초록이었고 그 주석이 "오류 토스트가 생기면
 * 여기서 갈라야 한다 — 전부 초록이면 실패가 성공처럼 보인다"고 경고해 뒀는데, 실제로 그
 * 시점이 왔다.
 *
 * 실행 취소 버튼은 초록 면 위에 서므로 shadcn `outline`의 배경·보더를 흰색 계열로 덮는다.
 * 그대로 두면 밝은 면이 초록 위에 얹혀 버튼만 다른 카드처럼 보인다.
 */
function AppToastList() {
  const { toasts } = useToastManager();
  return toasts.map((item) => {
    /*
     * **실패는 빨강이고, 성공과 다른 규칙으로 산다** (사용자 결정).
     *
     * 색만 갈라서는 부족하다 — 실패 문구는 성공 문구와 나르는 것이 다르기 때문이다.
     *
     *   - **잘리지 않는다.** 성공은 "됐다" 한 마디라 한 줄이면 되지만, 실패는 잔여 개수나
     *     멈춘 단계를 담는다(`cloudDeleteRemaining`·`resetStoppedAt*`). 그것이 잘리면
     *     남는 것은 "실패했다"뿐이고, 그건 이미 색이 말한 것이다.
     *   - **스스로 사라지지 않는다**(`timeout: 0`을 부르는 쪽이 준다). 실패는 다시 눌러야
     *     할 일이라(`resetRetryNote`) 읽기 전에 사라지면 안 된다.
     *   - 그래서 **닫는 길이 있어야 한다.** 성공 토스트에는 닫기가 없다 — 자동 소멸이
     *     그 일을 하기 때문이고, 사라지지 않는 것에만 문이 필요하다.
     */
    const failed = item.type === 'error';
    return (
      <Toast
        key={item.id}
        toast={item}
        className={`rounded-lg border-transparent shadow-md ${
          failed ? 'bg-destructive text-destructive-foreground' : 'bg-success text-success-foreground'
        }`}
      >
        <ToastContent className="gap-2 px-3 py-2">
          <ToastTitle className={`min-w-0 flex-1 text-xs ${failed ? '' : 'truncate'}`} />
          {item.actionProps && (
            <ToastAction
              render={<Button variant="outline" size="xs" />}
              className="border-white/40 bg-transparent text-inherit hover:border-white/60 hover:bg-white/15 hover:text-inherit dark:border-white/40 dark:bg-transparent dark:hover:bg-white/15"
            >
              {actionLabel(item.data)}
            </ToastAction>
          )}
          {failed && (
            /*
              이름은 **부르는 쪽이 실어 보낸다**(`data.closeLabel`) — 실행 취소 라벨과 같은 길이다.
              이 셸은 `LocaleProvider` **밖**에 산다(엔트리가 `<ToastProvider><App/></ToastProvider>`로
              감싼다) 그래서 여기서는 카탈로그를 부를 수 없다. shadcn이 박아 둔 영어 기본값을
              덮는 것이 이 prop의 일이다.

              **지금 이 이름은 낭독되지 않는다** — Base UI가 이 버튼에 `aria-hidden`을 달아
              접근성 트리에서 빼기 때문이다(실측). 닿는 길은 키보드다(`tabindex="0"`은 남는다).
              그래도 카탈로그로 덮는 이유는 그 결정이 바뀌는 날 영어가 남지 않게 하기 위해서다.
            */
            <ToastClose
              aria-label={closeLabel(item.data)}
              render={<Button variant="ghost" size="xs" />}
              className="text-inherit hover:bg-white/15 hover:text-inherit"
            />
          )}
        </ToastContent>
      </Toast>
    );
  });
}

/** add({ data: { actionLabel } })로 실린 라벨을 꺼낸다 — 없으면 버튼에 글자를 두지 않는다. */
function actionLabel(data: unknown): string | undefined {
  return dataString(data, 'actionLabel');
}

/** 실패 토스트의 닫기 이름 — 없으면 shadcn의 영어 기본값이 남으므로 부르는 쪽이 늘 싣는다. */
function closeLabel(data: unknown): string | undefined {
  return dataString(data, 'closeLabel');
}

function dataString(data: unknown, key: string): string | undefined {
  if (data && typeof data === 'object' && key in data) {
    return String((data as Record<string, unknown>)[key]);
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
        {/* 폭도 함께 줄인다 — 셸이 760px이라 shadcn 기본(384px)은 화면의 절반이다. */}
        <ToastViewport className="max-w-64">
          <AppToastList />
        </ToastViewport>
      </ToastPortal>
    </ShadcnToastProvider>
  );
}
