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

## 리뷰 반영 (2축)

**Spec: ADR 0012가 명시한 네 번째 프리미티브가 04·05 사이로 빠져 있었다.** ADR 0012와 스펙 모두 "버튼 프리미티브(Button, IconButton, SwitcherChip, **메뉴 항목**)"라고 적었는데 `menu.tsx`는 손대지 않았고, 티켓 05는 stagger와 삭제 라벨만 다룬다. 메뉴 항목의 누름·호버는 이 티켓 소관이므로 여기서 `render={<m.div {...press} />}`로 넣었다.

**Spec: 비활성 컨트롤이 무방비였다.** `disabled:pointer-events-none`을 가진 것은 Button뿐이고, IconButton·SwitcherChip은 cva에 `disabled:` 처리가 아예 없다. CSS `active:scale-95`는 disabled에서 애초에 발동하지 않았지만 motion의 제스처는 `disabled` 속성을 읽지 않으므로, 셋 다 비활성 상태에서 움직일 수 있었다. `usePressMotion(disabled)`이 빈 객체를 돌려주도록 계약에 포함했다.
- 다만 **게이트로 고정하지는 못했다** — 오늘 `disabled`가 실제로 붙는 것은 Button뿐이고 그건 `pointer-events-none`이 이미 막는다. 티켓 06이 저장 중 비활성 버튼을 만드니, 그때 스모크 단언을 붙이는 것이 자연스럽다.

**Spec/Standards: 감도 대조가 4개 중 1개만 덮었다.** 대조가 Button만 보면 칩·아이콘버튼·메뉴항목의 부재 단언은 여전히 "구현 안 해도 통과"로 남는다. 특히 아이콘버튼은 Base UI `Tooltip.Trigger render=` 합성을 거쳐 가장 위험한데 대조가 없었다. 네 프리미티브 전부를 같은 프로브로 훑도록 넓혔다.

**Standards: 대조와 부재의 실행 순서를 뒤집었다.** LazyMotion features는 지연 로드라 로드 전에 부재를 재면 공짜로 통과한다. 같은 대기 시간에 기본 모션이 실제로 움직이는 것을 **먼저** 확인하면, 뒤이은 부재 단언의 대기가 충분했다는 근거가 된다.

**그 밖에**
- 아이콘버튼의 `rest` 판독이 정직하지 않았다(버튼 자신을 호버해 드러낸 뒤 읽었다). 행 텍스트를 호버해 "보이지만 호버되지 않은" 상태에서 읽는다.
- `boundingBox()`가 null이면 예외로 스위트를 죽이던 것을 값으로 돌려준다 — N22c에서 이미 겪은 실수다.
- `MotionButtonAttributes`가 과하게 걷어내고 있었다. motion이 재정의하는 것은 `onAnimationStart`·`onDrag*`뿐이고 `onAnimationEnd`·`onAnimationIteration`은 건드리지 않으므로 남긴다.
- 손으로 짠 `PressMotionProps` 반환 타입을 없앴다(모듈 밖에서 이름 붙일 수 없는 `typeof PRESS_SPRING`을 참조하고 있었다). 추론에 맡긴다.
- 포괄 `transition`을 `transition-colors`로 바꾸며 `disabled:opacity-50`의 전이가 사라졌다. transform은 motion이 소유해야 하므로 포괄 transition은 되돌릴 수 없어, 속성을 명시해 opacity를 되살렸다.
- N18a 대기 창을 3s → 500ms로 좁혔다. 교체가 0~7ms이므로 "폼을 열면 곧바로 포커스"라는 계약을 여전히 관측한다.

**남긴 것 하나 — 모션 타이밍이 세 곳에 흩어져 있다** (`press-motion.ts`의 spring, `motion-row.tsx`의 0.18/easeOut, `motion-view.tsx`의 0.12). ADR 0012의 "앱 전체가 하나의 모션 언어"에는 공유 타이밍 토큰이 어울리지만, MotionRow·MotionView는 티켓 05·06이 다시 건드리는 자리라 그때 함께 모으는 편이 낫다고 보고 남겼다.
