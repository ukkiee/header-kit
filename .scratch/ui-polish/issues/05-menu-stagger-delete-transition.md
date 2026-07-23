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
