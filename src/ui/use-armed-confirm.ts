import { useEffect, useState } from 'react';

/**
 * 무장이 스스로 풀리기까지의 시간.
 *
 * **값의 근거는 사용자 쪽이지 테스트 쪽이 아니다.** 스모크에서 무장과 확인 사이가 가장 긴
 * 자리도 1.04초라(N39, 실측) 어느 값도 게이트에 걸리지 않는다 — 그래서 "생각하다 누르는
 * 사람"을 기준으로 고른다. 15초는 되물음을 읽고, 다른 창을 확인하고, 돌아와 누르기에 넉넉하다.
 *
 * 시간 제한이 접근성 문제가 되지 않는 이유: 이 만료가 하는 일은 **더 안전한 쪽으로 되돌리는
 * 것뿐**이다. 아무것도 잃지 않고, 다시 하려면 두 번 누르면 된다. 잃는 것이 있는 시간 제한과
 * 같은 부류가 아니다.
 */
export const ARMED_CONFIRM_TIMEOUT_MS = 15_000;

/**
 * 두 번 눌러야 실행되는 버튼의 무장 상태 (CONTEXT.md의 **2단 확인**).
 *
 * 다섯 표면이 같은 규약을 쓰도록 한 곳에 둔다 — 규칙 삭제 · 프로필 삭제 · 백업 한 행 삭제 ·
 * 클라우드 삭제 · 전체 초기화. 각자 `useState(false)`를 들고 있던 시절에는 해제 장치가
 * 표면마다 달랐고, 그 차이가 곧 결함이었다.
 *
 * **무장은 반드시 스스로 풀린다.** 그것이 이 훅의 존재 이유다. 예전 규약("무장이 화면에 서
 * 있으면 덫이 아니다")은 실측이 반증했다:
 *
 *   - 무장한 규칙 행에서 **다른 행의 편집을 열면** hoist가 순서를 바꿔 그 체크 버튼이
 *     y=170에서 y=811로 밀려난다 — 팝업은 580px이라 보이지 않는 곳에 무장한 채 남는다.
 *   - 더 나쁜 것: 다른 표면이 앞 규칙을 지우면 무장한 행이 **다른 규칙의 삭제 버튼이 있던
 *     그 좌표로 미끄러져 들어온다.** 그 자리를 한 번 누르자 엉뚱한 규칙이 실제로 지워졌다.
 *   - 탭 화면은 팝업과 달리 무기한 열려 있어 그 무장이 며칠을 산다.
 *
 * 그래서 해제 장치는 **입력 방식을 가리지 않아야 한다.** 포인터 이탈은 마우스에서만 걸리고
 * (펜은 버튼을 떠나도 `pointerleave`가 오지 않는다 — 실측), 포커스 이탈은 클릭한 사용자에게
 * 닿지 않으며, Escape는 알고 눌러야 한다. 셋 다 **더 빨리 푸는** 보조 장치일 뿐이고,
 * 바닥을 까는 것은 시간 초과 하나다.
 *
 * @param resetKey 목록에서 이 행의 **자리**를 말하는 값. 바뀌면 무장이 풀린다 — 위의 좌표
 *   함정을 닫는 것은 이것뿐이다. 시간 초과로는 못 닫는다: 자리를 옮기는 것이 사용자 자신의
 *   한 번의 클릭이라 어느 만료 시간보다도 먼저 일어난다.
 */
export function useArmedConfirm(resetKey?: unknown): {
  armed: boolean;
  /** 누름 하나. 무장 전이면 무장만 하고, 무장 중이면 풀면서 `run()`을 부른다. */
  press: (run: () => void) => void;
  disarm: () => void;
} {
  const slot = useArmedConfirmSlot<true>(resetKey);
  return {
    armed: slot.armedId === true,
    press: (run) => slot.press(true, run),
    disarm: slot.disarm,
  };
}

/**
 * 여러 버튼이 **한 무장을 나눠 갖는** 형태 — 백업 패널이 쓴다.
 *
 * 그 패널에는 파괴적 동작이 셋 있고(히스토리 한 행 삭제 · 클라우드 삭제 · 전체 초기화)
 * 각자 자기 `useState`를 들고 있었다. 그래서 **셋이 동시에 무장할 수 있었다** — 실측으로
 * "전부 지울까요?"와 "클라우드에서 지울까요?"가 나란히 서 있는 화면을 만들었다. 슬롯이
 * 하나면 다른 것을 무장시키는 순간 앞의 것이 풀리므로, 화면에 서 있는 되물음이 언제나 하나다.
 *
 * `id`는 그 버튼을 가리키는 값이면 무엇이든 된다(`===`로 비교한다). 스냅샷 행처럼 여럿이면
 * 그 행의 id를 담은 문자열을 쓴다.
 */
export function useArmedConfirmSlot<T>(resetKey?: unknown): {
  armedId: T | null;
  isArmed: (id: T) => boolean;
  /** 누름 하나. 그 id가 무장 전이면 무장만 하고, 무장 중이면 풀면서 `run()`을 부른다. */
  press: (id: T, run: () => void) => void;
  disarm: () => void;
} {
  const [armedId, setArmedId] = useState<T | null>(null);
  const armed = armedId !== null;

  // 자리가 바뀌면 푼다. 마운트에서도 한 번 도는데 이미 `null`이라 React가 갱신을 건너뛴다.
  useEffect(() => {
    setArmedId(null);
  }, [resetKey]);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmedId(null), ARMED_CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    /*
     * **capture 단계에 붙인다.** 규칙 폼이 열려 있으면 그 폼이 Escape에서
     * `stopPropagation()`을 부르므로(`rule-form.tsx`), 버블 단계 리스너에는 닿지 않는다.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArmedId(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [armed]);

  return {
    armedId,
    isArmed: (id) => armedId === id,
    press: (id, run) => {
      if (armedId !== id) {
        setArmedId(id);
        return;
      }
      setArmedId(null);
      run();
    },
    disarm: () => setArmedId(null),
  };
}
