# 04 — 버튼 누름·호버 모션 + reduced-motion 관측 계약

**What to build:** 버튼을 누르면 spring 물리로 반응하고 호버에도 부드러운 반응이 있어 클릭 가능한 대상임이 분명해진다. 동시에 모션 민감 사용자에게는 이 애니메이션이 **실제로 꺼진다** — "약하게"가 아니라 없다. 이 티켓이 세우는 계약을 이후 모션 티켓이 그대로 따른다(ADR 0012).

**Blocked by:** 01

**Status:** done

- [x] 세 프리미티브의 누름·호버가 spring으로 반응한다 — 실측 hover `matrix(1.02…)`, press `matrix(0.951…)`. `active:scale-95`와 포괄 `transition`은 제거하고 색 전이만 CSS(`transition-colors`)에 남겼다
- [x] reduced-motion에서 애니메이션 prop을 아예 받지 않는다 — `usePressMotion()`이 빈 객체를 돌려준다. 지속시간 0 대체 아님
- [x] 공유 헬퍼 하나 — `src/ui/press-motion.ts`. reduced-motion 분기도, motion과 이름이 겹치는 DOM 핸들러 Omit 타입도 여기 한 곳에 있다
- [x] smoke **N21b**: reduced-motion에서 버튼·칩·아이콘버튼 셋 다 rest·hover·down 전부 `none`
- [x] smoke **N21c** 감도 대조: 기본 모션에서 같은 프로브가 hover·down 변형을 관측. **모션을 없애 보니 N21b는 그대로 통과하고 N21c만 FAIL했다** — 대조가 없으면 부재 단언이 정말로 퇴화한다는 증거다
- [x] 기능 회귀 0 — smoke 87/87 (2회 연속)
- [x] 시작 지표 기록 — 아래
- [x] 전 게이트 green — tsc 0 · vitest 203/203 · build · bundle-gate PASS(+139.7KB/143KB) · smoke 87/87 · storybook · ui-diag(overflow 0, 시작 지표 PASS)

## 측정치

- **시작 지표:** first paint 64/60/64ms, dom ready 39.0/37.2/38.7ms (기준선 64.0 / 36.7). **회귀 없음.**
  - ADR 0012는 "모든 버튼이 motion 컴포넌트가 되어 렌더 비용이 늘고(팝업 첫 페인트에 가장 민감)"를 트레이드오프로 적었는데, 실측으로는 잡히지 않는다. motion 런타임이 이미 초기 청크에 있었고 features는 지연 청크라, 추가된 것이 컴포넌트 래핑뿐이기 때문으로 보인다.
- **번들:** 즉시 합계 525.5 → **525.7KB (+0.2KB)**. features는 여전히 지연 청크(36.4KB).

## 딸려 온 것 둘

**Storybook에 MotionProvider 데코레이터.** 버튼이 `m` 컴포넌트가 되면서 `LazyMotion strict`의 조상이 필요해졌다 — 데코레이터가 없으면 버튼을 쓰는 **모든** 스토리가 렌더 단계에서 실패한다. 스토리북이 프리미티브의 렌더 게이트라 이걸 안 하면 게이트가 통째로 깨진다.

**`MotionButtonAttributes` 타입.** motion이 `onAnimationStart`·`onDrag*`를 자기 의미로 재정의해 DOM 핸들러 타입과 충돌한다. 세 프리미티브가 같은 Omit을 반복하지 않도록 헬퍼에 뒀다.

## 티켓 03이 심어 둔 잠복 레이스를 드러냈다

N18a(폼 열면 헤더 이름에 포커스)가 깨졌다. 원인은 이 티켓이 아니라 **티켓 03의 지연 청크 교체**다 — N18a는 클릭 직후 `document.activeElement`를 한 번만 읽는데, 그 찰나에 존재하는 것은 datalist 표현이고 곧 Autocomplete로 교체된다. 이 티켓이 렌더 비용을 조금 늘리면서 그 창에 걸리게 됐을 뿐이다.

단독 실행으로 포커스가 3/3 정상 도달함을 먼저 확인하고(=제품 결함 아님), 사용자에게 보이는 계약("폼이 열리면 이 필드에 포커스가 있다")을 그대로 두되 정착을 기다려 단언하도록 고쳤다. 고친 뒤 2회 연속 87/87.
