# 09 — 아코디언 헤더 전체를 클릭 대상으로

**What to build:** 백업·환경설정 패널을 열 때 오른쪽 끝 작은 아이콘을 조준하지 않아도 된다 — 제목·여백·아이콘 어디를 눌러도 열린다. 키보드 사용자에게 헤더는 여전히 하나의 포커스 대상이라 Tab이 늘지 않고, 스크린리더는 지금 열려 있는지 안다.

**Blocked by:** 01

**Status:** done

- [x] 헤더 행 전체가 클릭 대상 — smoke가 **제목·여백·아이콘 세 지점**을 각각 눌러 매번 토글되는지 본다
- [x] 포커스 대상이 하나 — 트리거 내부의 focusable이 **0개**임을 단언한다(중첩 버튼이 생기면 Tab 정지가 는다)
- [x] `aria-expanded`가 `false → true → false → true`로 따라온다
- [x] 아이콘은 트리거 안의 시각 표시 — 회전이 `none → 180deg`
- [x] smoke **N27**: 위 전부 + 백업 패널도 같은 셸을 쓰는지(한쪽만 고쳐 두지 않게)
- [x] 전 게이트 green — tsc 0 · vitest 203/203 · build · bundle-gate PASS(+141.3KB/143KB) · smoke **97/97** · storybook · ui-diag

## 아이콘 버튼을 없앴다

헤더 행 전체가 트리거가 되면 그 안의 `IconButton`은 **중첩 버튼**이 된다(HTML 위반이고 Tab 정지가 둘이 된다). 아이콘은 이제 트리거 안의 평범한 svg이고, 상태는 회전으로만 보인다 — 스펙의 구현 결정 그대로다.

딸려서 `showLabel`/`hideLabel` prop과 그 뒤의 `show`/`hide` 카탈로그 키가 고아가 됐다(툴팁이 사라졌으므로). 컴포넌트·두 호출부·스토리에서 prop을 걷어내고 카탈로그 키도 지웠다 — 안 쓰는 번역 항목을 남겨 두면 다음 사람이 어디에 쓰이는지 찾게 된다.

접근성 이름은 `toggleAriaLabel`("Toggle preferences")로 유지했다. 보이는 제목("Preferences")이 그 이름에 포함되므로 WCAG 2.5.3을 만족하고, 기존 스모크·진단이 쓰던 선택자가 그대로 산다.

## PanelSection에 헤더 렌더 훅

셸(`border-t` + 헤더 행 + 본문)은 세 패널이 공유하는데, 접이식만 헤더가 상호작용 요소여야 한다. `renderHeader`를 두어 그 자리를 다른 요소가 차지할 수 있게 했다 — 헤더 마크업을 CollapsiblePanel에 복제하지 않으면서.

## 검증에서 배운 것 둘

**`w-full`은 중복이었다.** 처음엔 트리거에 `w-full`을 줬는데, 빼도 폭이 그대로 456px이었다 — `PanelSection`의 `flex flex-col`이 이미 행 전체로 늘린다. 지우고, 폭 단언도 절대 px이 아니라 **부모 섹션 폭과 같은지**로 바꿨다. 절대값으로 재면 레이아웃이 바뀌었을 때 무엇을 보는지 알 수 없다.

**Tailwind v4의 `rotate-180`은 `transform`이 아니라 CSS `rotate` 속성을 쓴다.** `transform`만 읽으면 열림·닫힘 둘 다 `none`이라 회전을 못 본다. (`transition-transform`은 v4에서 `transform,translate,scale,rotate`를 모두 전이 대상으로 잡으므로 회전은 실제로 애니메이션된다 — 생성된 CSS로 확인.)

N27은 헤더가 버튼이 아니게 되는 경우를 **값으로** 받는다 — `waitFor`가 던져 스위트를 중단시키면 FAIL로 기록되지 않는다(N22c·N24c에서 이미 겪은 실수).
