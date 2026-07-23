# 05 — 메뉴 항목 순차 등장 + 삭제 2단 확인 전환

**What to build:** 메뉴가 열릴 때 항목이 한꺼번에 튀어나오지 않고 순차로 등장해 눈이 따라간다. 삭제를 눌러 확인 단계로 바뀔 때도 부드럽게 전환돼 단계가 넘어간 것을 인지한다. reduced-motion에서는 둘 다 즉시 완성된 상태로 나타난다.

**Blocked by:** 04 — 04가 세운 reduced-motion 계약과 공유 헬퍼를 그대로 따른다.

**Status:** done

- [x] 메뉴 항목이 순차 등장한다 — 팝업이 오케스트레이터(`staggerChildren`), 항목이 자식. 실측 첫 프레임 `[0.069, 0]`(둘째는 아직 시작 전) → 정착 `[1, 1]`
- [x] 삭제 2단 확인 라벨 교체에 전환 — `MotionSwap`(`mode="wait"`)으로 이전 라벨이 빠진 뒤 새 라벨이 들어온다. 실측 첫 프레임 opacity 0.096
- [x] 총 지연이 `src/ui/motion-tokens.ts`의 `menuStaggerTotalMs(n)`이고, **스모크가 그 함수를 직접 import해** 관측 창을 잡는다(테스트가 자기 숫자를 들지 않는다)
- [x] smoke **N23a**: reduced-motion에서 첫 애니메이션 프레임에 모든 항목 `opacity 1`
- [x] smoke **N23b**: reduced-motion에서 확인 라벨 등장 프레임에 `opacity 1`, 메뉴는 열린 채 유지
- [x] smoke **N23c**: 기능 회귀 0 — 키보드 이동(`data-highlighted`), Esc 닫기, 항목 선택(복제 반영)
- [x] 전 게이트 green — tsc 0 · vitest 203/203 · build · bundle-gate PASS(+140.4KB/143KB) · smoke **90/90** · storybook · ui-diag(overflow 0, 시작 지표 PASS)

## 측정치

- **번들:** 즉시 합계 525.8 → **526.4KB (+0.6KB)**
- **시작 지표:** first paint 64/76/76ms, dom ready 40.1/50.6/42.2ms (기준선 64.0 / 36.7). 스태거·라벨 전환은 메뉴 팝업 안에만 있어 시작 경로에 없다 — 표본에 120·108ms 같은 튀는 값이 섞인 것으로 보아 기기 잡음이다(티켓 02에 기록한 변동 폭 안).

## 양방향으로 못박았다

두 단언 모두 **대조와 부재를 한 record에** 담았다. 스태거와 라벨 전환을 동시에 걷어내 보니 N23a·N23b **둘 다 FAIL**했다 — 부재 단언만 있었다면 구현하지 않아도 통과했을 자리다(티켓 04에서 배운 것).

관측 창이 한 프레임이라 Playwright 왕복으로는 못 잡는다. 페이지 안에 `MutationObserver`를 심어 대상이 나타난 **다음 애니메이션 프레임**의 계산 opacity를 찍는다.

## 티켓 04에서 넘겨받은 것 — 모션 타이밍 단일 출처

`press-motion`의 spring, `motion-row`의 0.18/easeOut, `motion-view`의 0.12가 세 곳에 흩어져 있던 것을 `src/ui/motion-tokens.ts`로 모았다. ADR 0012의 "앱 전체가 하나의 모션 언어"는 값이 한 곳에 있어야 성립한다.

이 모듈은 런타임 의존성 없이 상수만 둔다 — 스모크(`.mjs`)가 그대로 import하기 때문이다. Node 24의 타입 스트리핑이 `as const`를 걷어내므로 `.ts` 그대로 읽힌다(tsc와 Node 양쪽에서 확인).

## 스태거가 티켓 04의 단언을 깨뜨렸다

N21b(누름·호버 감도 대조)가 실패했다. 메뉴 항목에 등장 애니메이션(`y: -4 → 0`)이 생기면서, 04의 프로브가 읽던 "rest"가 **스태거 진행 중 변형**을 잡았기 때문이다. 04의 프로브가 메뉴를 열자마자 항목을 재던 것을, `menuStaggerTotalMs`만큼 기다린 뒤 재도록 고쳤다 — 같은 상수를 두 테스트가 공유한다.

부수로 선택자 모호성도 하나 걷어냈다. 시드 프로필 이름이 'Menu'였는데 `getByRole('button', { name: 'Profile menu' })`가 사이드바 칩("Select profile Menu (on)")과도 매치돼 strict 위반으로 스위트가 죽었다. 해당 선택자를 전부 `exact: true`로 바꾸고 시드 이름도 바꿨다.

## 리뷰 반영 (2축)

**Spec이 잡은 핵심 — 내 단언은 "순차"를 검증하지 않았다.** N23a의 대조가 `staggerLively.some((o) => o < 1)`이었는데, 이건 `MENU_ITEM_STAGGER_S = 0`으로 **전부 동시에 fade**해도 통과한다. story 19가 요구한 것은 "애니메이션이 있다"가 아니라 "순차로 등장한다"다. 앞 항목이 뒤 항목보다 더 진행돼 있음(`staggerLively[i-1] > staggerLively[i]`)을 단언하도록 바꾸고, stagger를 0으로 만들어 실제로 FAIL하는 것까지 확인했다(`lively=[0.074, 0.074], sequential=false`).

**Standards: reduced-motion 분기가 다시 흩어졌다.** `press-motion.ts`가 "넷이 각자 분기를 반복하지 않도록 여기 한 곳에 둔다"고 적어 놓고, `MenuItem`이 `useReducedMotion()`과 `usePressMotion()`을 함께 부르고 `MenuPopup`이 세 번째로 불렀다. 계약을 집행하는 `useMotionProps(props, off?)`를 헬퍼에 두고 `usePressMotion`도 그 위에 얹었다 — 이제 "모션이 꺼지면 빈 객체"를 아는 곳이 하나다.

**Standards: `MotionSwap`의 두 갈래가 박스 모델이 달랐다** (`<span>` vs `<m.span className="inline-block">`). ADR 0012의 "reduced-motion에서는 모션만 꺼지고 기능은 동일" 경계에 어긋나 양쪽을 맞췄다.

**Standards: 테스트가 메뉴 항목 수 `2`를 하드코딩했다.** 항목 수는 호출부(`profile-section`) 소관이라, 항목이 늘면 관측 창이 조용히 어긋난다. 실제 렌더된 항목 수를 세어 `menuStaggerTotalMs`에 넘긴다.

**Standards: 관측자가 못 찾으면 페이지에 남았다.** `subtree`+`characterData` 관측자가 매 변경마다 전체 문서를 훑게 된다. 타이머로 스스로 물러나게 했다.

**반영하지 않은 것**
- `render`가 `{...props}`보다 앞이라 호출자가 `render`를 넘기면 모션이 조용히 사라진다. 앱 내부 프리미티브라 호출자가 하나뿐이고, 어느 쪽이 이겨야 하는지는 합성 정책 결정이라 지금 임의로 정하지 않았다 — 주석으로 남겼다.
- `MENU_ITEM_STAGGER_S`가 전이 객체가 아니라 초 단위 숫자인 것은 `staggerChildren`이 숫자를 받기 때문이다. 이름의 `_S`가 단위를 말한다.
- `mode="wait"` 때문에 확인 라벨 인지가 ~120ms 늦고 3초 타이머 중 실효 확인 창이 ~2.76초가 된다. 리뷰도 결함은 아니라고 봤고, 겹쳐 보이지 않는 편이 단계 전환에는 낫다고 판단해 유지했다.
