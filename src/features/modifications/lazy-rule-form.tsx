import { useSyncExternalStore, type ComponentType } from 'react';
import type { RuleFormProps } from './rule-form';

/**
 * 규칙 폼을 동적 import 청크로 미룬다 (티켓 07).
 *
 * 왜: 폼은 **목록을 보는 동안에는 그려지지 않는다.** 그런데 첫 페인트 컴포넌트가 폼을 정적으로
 * import하고 있어서 폼 전용 프리미티브(Base UI Select 등)까지 팝업이 즉시 내려받았다. 실측
 * 수치와 경위의 정본은 `.scratch/scope-race-hardening/issues/07-bundle-gate-overrun.md`다 —
 * 숫자를 여기 옮겨 적지 않는다(`scripts/bundle-gate.mjs`가 같은 이유로 같은 규칙을 세워 뒀고,
 * 이 파일의 첫 판이 그 규칙을 어겼다가 곧바로 정본과 어긋났다).
 *
 * **`React.lazy`를 쓰지 않는다.** 같은 이유가 `header-name-input.tsx`에 이미 실측으로 적혀 있다 —
 * lazy는 모듈이 도착해 있어도 첫 렌더에서 한 번 서스펜드했다가 재시도하고, 그 왕복이 ~250ms였다.
 * 그래서 그 파일과 같은 모양을 쓴다: 받아 둔 컴포넌트를 모듈 스코프에 두고 곧바로 동기 렌더한다.
 *
 * **마운트 시점에 미리 받지도 않는다.** 같은 파일이 기록한 실측이 그 이유다 — 앞당긴 로드가 첫
 * 페인트 **전에** 끼어들어 시작이 62 → 85ms로 늘었다. 이 티켓의 목적이 시작을 가볍게 하는
 * 것인데 받는 시점을 앞당겨 상쇄하면 앞뒤가 맞지 않는다.
 *
 * 대신 **의도 시점에 받는다** — 아래 `ruleFormIntentProps`를 폼으로 가는 길목에 붙인다.
 */
let loadedComponent: ComponentType<RuleFormProps> | null = null;
let pending: Promise<void> | null = null;
const subscribers = new Set<() => void>();

export function loadRuleForm(): Promise<void> {
  pending ??= import('./rule-form')
    .then((module) => {
      loadedComponent = module.RuleForm;
      for (const notify of subscribers) notify();
    })
    .catch(() => {
      /*
       * 삼키기만 한다 — 여기서 재시도할 방법이 없다. 브라우저 모듈 맵이 실패한 fetch를 캐시하므로
       * `pending`을 비워도 `import()`는 재요청 없이 같은 거절을 돌려준다(같은 사실이
       * `header-name-input.tsx`에 실측과 함께 적혀 있다).
       *
       * 사용자가 보는 것은 폼 자리에 빈 자리가 남는 것이다. **막다른 길은 아니다** — 이 컴포넌트를
       * 렌더하는 `ProfileSection`이 `app.tsx`에서 `key={selectedProfile.id}`로 걸려 있고 레일
       * 전환에도 언마운트되므로, 레일을 한 번 오가거나 다른 프로필을 골랐다 돌아오면 리마운트되며
       * 목록이 그대로 돌아온다(리뷰가 청크를 막고 실측으로 확인했다). 다만 그 회복 경로가 폼
       * 자리에서 **보이지는 않는다** — 저하 경로에 출구를 세우는 일은 이월했다(티켓 저널 참조).
       */
    });
  return pending;
}

/**
 * 폼으로 가는 길목에 붙이는 의도 신호. 한 덩어리로 내보내는 이유는 **길목이 여럿이기 때문**이다 —
 * 손으로 복제하면 새 길목이 생겼을 때 조용히 빠진다. 실제로 이 파일의 첫 판이 '규칙 추가' 버튼
 * 둘에만 붙이고 편집 연필을 빠뜨렸고, 리뷰가 그것을 실측으로 잡았다(편집 진입 시 자리표시가
 * 1~2프레임 실제로 그려졌다).
 */
export const ruleFormIntentProps = {
  onPointerEnter: () => void loadRuleForm(),
  onFocus: () => void loadRuleForm(),
} as const;

const subscribe = (onChange: () => void) => {
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
};

const getSnapshot = () => loadedComponent;
const getServerSnapshot = () => null;

/**
 * 도착해 있으면 그 컴포넌트를, 아니면 `null`을 준다. **구독 자체는 받아 오지 않는다** — 받는
 * 시점은 호출부가 정한다(위 `ruleFormIntentProps`와 폼을 여는 문).
 */
export function useRuleForm(): ComponentType<RuleFormProps> | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * 폼이 도착하기 전 그 자리를 잡는 상자.
 *
 * 이름에 'Placeholder'를 쓰지 않는다 — `CONTEXT.md`가 그 낱말을 Modification 값 템플릿의
 * `{{uuid}}` 토큰으로 이미 정의했다.
 *
 * 높이는 **근사치다.** 실제 폼 높이는 종류마다 달라 하나의 옳은 값이 없다 — 리뷰가 실측한
 * 범위가 342px(Block·Redirect)에서 466px(응답 헤더)이고 기본 생성 폼은 424px이다. 여기서
 * 고른 384px은 그 범위 안이고 기본값에 가깝다. 첫 판의 192px은 근거 없는 추정치였고 실제의
 * 절반이라, 열림 애니메이션이 그 높이까지 갔다가 청크 도착 시 한 번에 튀었다.
 *
 * 그래도 **정확히 맞을 수는 없으므로** 이 상자가 보이는 것 자체를 드물게 만드는 쪽이 본선이다 —
 * 그것이 `ruleFormIntentProps`가 하는 일이다.
 */
export function RuleFormSlot() {
  return <div aria-hidden className="min-h-96 rounded-lg bg-secondary p-3" />;
}
