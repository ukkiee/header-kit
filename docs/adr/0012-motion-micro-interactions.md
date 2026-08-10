# 버튼 마이크로 인터랙션을 motion으로 통일한다

버튼 프리미티브(Button, IconButton, SwitcherChip, 메뉴 항목)의 누름·호버를 CSS 전이에서 motion의 `whileHover`/`whileTap` spring으로 옮긴다. 이 결정은 ui-refine 08에서 내린 "마이크로 인터랙션은 CSS 전이 유지" 부분을 **대체**한다 (ADR 0011의 Base UI 일원화 자체는 그대로 유효하다).

- **맥락**: ui-refine 08은 motion을 도입하면서 CSS가 이미 잘 하는 것(hover 색 전이, `active:scale-95`)까지 JS로 옮기지 않기로 했다. 당시 근거는 번들과 리렌더 비용이었고, 리뷰도 "CSS로 충분한 곳까지 JS화하는 과유지비"를 지적했다. 그러나 실제로 써 본 사용자는 누름 반응이 밋밋하고 메뉴 항목이 한꺼번에 튀어나온다고 평가했다 — CSS 전이로는 spring 물리와 순차 등장(stagger)을 낼 수 없다.
- **결정**: 버튼 계열의 누름·호버를 motion으로 통일하고, 메뉴 항목 등장에 stagger를, 삭제 2단 확인의 라벨 교체에 전환을 준다. 앱 전체가 하나의 모션 언어를 갖는다.
- **트레이드오프**: 모든 버튼이 motion 컴포넌트가 되어 렌더 비용이 늘고(팝업 첫 페인트에 가장 민감), CSS 한 줄로 되던 것이 컴포넌트 계약이 된다. 대신 조작 피드백이 일관되고 생동감 있으며, "어떤 버튼은 spring, 어떤 버튼은 CSS"라는 갈라짐이 사라진다. 번들은 제약이 아니다 — motion 런타임은 ui-refine 08에서 이미 초기 청크에 들어왔고, 컴포넌트 추가분은 수백 바이트 수준이다.
- **경계**: reduced-motion에서는 모든 모션이 꺼지고 기능은 동일해야 한다. 드래그 애니메이션은 여전히 dnd-kit이 담당한다(ADR 0011, 이중 적용 금지). 레이아웃·enter/exit 전환은 기존 MotionRow/MotionView가 계속 소유한다.

## 개정 — 아코디언 헤더는 예외이고, 일부 전이는 CSS가 소유한다

이 결정을 실제로 써 본 뒤 두 가지를 덧붙인다.

- **누름·호버 spring의 표면 목록에서 아코디언 헤더를 뺀다.** 한때 다른 버튼 프리미티브와 같은 `usePressMotion`을 썼는데, 폭이 좁은 버튼에서 자연스러운 1.02배가 화면 폭을 다 쓰는 헤더 행에서는 이동 거리가 그만큼 커져 과했다 — 같은 배율이 같은 인상을 주지 않는다. 그 표면의 피드백은 색 전이와 **열림/닫힘 높이 전환**이 맡는다. 상태가 실제로 바뀌는 표면이라 그쪽이 더 많은 것을 알려 준다. 남은 네 표면(Button, IconButton, SwitcherChip, 메뉴 항목)은 그대로다.
- **마운트를 Base UI가 소유하는 표면의 전이는 CSS가 맡는다.** 지금은 Select 팝업과 대형 편집기 다이얼로그의 열림/닫힘 둘이다. `AnimatePresence`를 겹치면 두 라이브러리가 같은 노드의 생사를 두고 다툰다. 대신 **길이·곡선은 여전히 `src/ui/motion-tokens.ts` 한 곳**에서 오고, 값은 `MotionProvider`가 문서 루트에 CSS 변수로 올린다(컴포넌트에서 인라인 `style`로 주면 Base UI가 자기 변수를 쓰면서 덮어써 사라진다 — 실측). Portal로 body에 붙는 팝업도 루트를 상속하므로 값이 닿는다.
- **접이식 패널은 반대로 갔다 — 마운트를 우리가 가져왔다.** CSS로 붙여 보려다 실패했다: 열림/닫힘 전이가 Base UI의 마운트 타이밍과 경합해 **20회 중 6~9회가 전이 없이 즉시 닫혔다.** `height`→`grid-template-rows`, `interpolate-size: allow-keywords`, `keepMounted`, 전이→키프레임 애니메이션까지 모두 비율이 그대로였다. 그래서 Base UI Collapsible을 걷어내고(필요한 시맨틱은 `aria-expanded`+`aria-controls` 둘뿐이다) 이 저장소가 이미 검증한 `MotionRow`(AnimatePresence + height)를 쓴다 — 규칙 폼이 같은 이유로 native `details`를 버린 선례가 있다(ui-refine 08). 20회 재측정에서 흔들림이 사라졌다(모두 ~275ms, reduced-motion은 ~11ms).
- **경계는 그대로다.** reduced-motion에서는 전이 클래스를 **아예 붙이지 않는다** — 지속시간 0으로 대체하는 것이 아니라 부재이고, `press-motion`이 빈 객체를 돌려주는 것과 같은 규율이다. smoke N29(패널)·N30(Select)·N53(다이얼로그)이 기본 모션과 reduced-motion을 함께 본다. **셋 다 '중간 단계가 몇 개냐'가 아니라 '얼마나 걸렸느냐'로 잰다** — 단계 수 단언은 위의 사라지는 전이를 통과시켰다(운 좋게 한 번 걸리면 초록이었다).

  다이얼로그에는 두 가지가 더 있다. 하나, 움직이는 것이 `translate`가 아니라 **`scale`**이다 — 셸이 가운데 정렬에 `translate`를 이미 쓰고 있어 같은 속성을 전이하면 위치가 싸운다(두 속성은 독립 변형 속성이라 나란히 놓인다). 둘, **열리는 중에 닫으면 닫힘 전이가 생략된다** — Base UI가 중단된 애니메이션을 끝난 것으로 치고(`useAnimationsFinished`의 `treatAbortedAsFinished`) 곧바로 언마운트한다. 사용자에게는 자연스러운 동작이지만 관측에는 함정이라, N53은 열림 전이가 끝나기를 기다린 뒤 닫는다.

## 개정 — reduced-motion 계약의 경계: 색 전이는 밖, 움직임·opacity는 안

릴리스 게이트가 "새 CSS 전이가 reduced-motion에서 안 꺼진다"를 발견으로 올려, 지금까지 암묵이던 경계를 명문화한다.

- **끄는 것(계약 안):** transform(scale·translate), opacity 페이드, height/`grid-template-rows` 같은 크기·레이아웃 전이, 순차 등장(stagger). 전정기관을 자극하는 **움직임**이 `prefers-reduced-motion`이 겨냥하는 대상이다. 이들은 reduced-motion에서 전이/애니메이션을 **아예 붙이지 않는다**(지속시간 0 대체가 아니라 부재). motion 프리미티브는 `usePressMotion`이 빈 객체를 돌려주는 것으로, CSS 표면은 `motion-reduce:transition-none`으로 집행한다.
- **끄지 않는 것(계약 밖):** `transition-colors` — 배경·보더·텍스트 색의 페이드. 색 변화는 화면이 움직이지 않으므로 전정기관을 자극하지 않고, 없애면 접근성 이득 없이 reduced-motion 사용자만 더 투박한(툭 바뀌는) UI를 쓰게 된다. `main` 이전부터 모든 Button이 조건 없는 색 전이를 갖고 있었고, 이 경계는 그 현행 동작과도 일치한다. `fieldFocus`·프로필 이름 입력·아코디언 헤더의 포커스/호버 색 전이가 여기 해당한다.
- **판정 기준:** "이 전이가 요소를 **이동·변형·페이드인아웃** 시키는가, 아니면 **색만** 바꾸는가." 앞이면 끄고, 뒤면 둔다. 스크롤바 페이드는 opacity라 앞에 속해 `motion-reduce:transition-none`을 받았고(전이만 끄고 opacity 값 60→100은 남긴다 — 어포던스 유지), smoke N33이 감도 대조와 함께 못박는다.

## 개정 — 메뉴 항목 표면이 사라진다 (ADR 0017, 티켓 04)

위 결정이 든 네 누름 표면 중 **메뉴 항목**이 없어진다. ADR 0017이 프로필의 이름 변경·색 변경·복제·삭제 컨트롤을 걷어내면서 그것들을 담고 있던 ⋯ 메뉴가 사라졌고, 그 메뉴가 앱의 **유일한** 메뉴였다 — 이제 화면에 뜨는 메뉴가 하나도 없다.

함께 걷히는 것: 메뉴 항목의 순차 등장(stagger)과 삭제 2단 확인 라벨 교체 전환, 그 모션 상수들(`MENU_ITEM_STAGGER_S` · `MENU_ITEM_FADE_S` · `LABEL_SWAP_S` · `menuStaggerTotalMs`), `ui/menu.tsx`와 `ui/motion-swap.tsx`, 그것들을 재던 스모크 셋. 렌더되지 않는 프리미티브를 남겨 두면 다음 사람이 그것을 살아 있는 계약으로 읽는다.

남는 것은 세 표면(Button · IconButton · SwitcherChip)이고, 그 셋의 결정은 위 그대로다. **2단 확인이라는 형태 자체는 남는다** — 백업 삭제와 전체 초기화가 같은 형태를 쓰고, 그쪽은 메뉴가 아니라 버튼 위에서 돈다.

