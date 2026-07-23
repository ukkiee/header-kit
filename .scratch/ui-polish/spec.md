# ui-polish — 셀렉트 폭 고정, Autocomplete·ScrollArea 채택, 검증 포커스, 버튼 모션, 아코디언·레일 접근성

**Triage:** ready-for-agent

## Problem Statement

ui-refine이 상호작용 계층을 정돈했지만, 실제로 써보면 걸리는 지점이 남아 있다. URL 필터의 매치 방식을 바꿀 때마다 셀렉트 폭이 라벨 길이를 따라 늘었다 줄어 옆의 패턴 입력이 밀린다 — 값을 고르는 동안 레이아웃이 흔들린다. 헤더 이름 자동완성은 아직 브라우저 기본 datalist라 앱의 나머지 팝업과 생김새가 다르고 키보드 조작도 브라우저마다 제각각이다. 스크롤 영역도 OS 기본 스크롤바여서, 앱 스타일로 통일된 다른 표면과 이질적이다. 폼에서 필수 항목을 비운 채 저장하면 오류는 보이지만 포커스가 그대로라 어느 입력으로 가야 할지 직접 찾아야 한다. 버튼은 눌러도 반응이 밋밋하고(단순 CSS 전이), 메뉴가 열릴 때 항목이 한꺼번에 튀어나온다. 백업·환경설정 아코디언은 제목을 눌러도 안 열리고 오른쪽 끝 작은 아이콘만 클릭 대상이라 조준이 필요하다. 왼쪽 레일의 아이콘 세 개는 다른 아이콘 버튼과 달리 툴팁이 없어 무엇인지 확인할 방법이 호버로는 없다.

## Solution

남은 거친 면을 다듬는다. 셀렉트 트리거는 폭을 고정해 선택이 레이아웃을 흔들지 않게 하고, 자동완성은 Base UI Autocomplete로 바꿔 앱 스타일 팝업과 일관된 키보드 조작을 얻는다(후보 산출 규칙은 그대로). 스크롤 영역은 Base UI ScrollArea로 통일해 스크롤바가 앱의 시각 언어를 따르게 한다. 저장이 검증으로 막히면 첫 누락 입력으로 포커스가 이동해 바로 고칠 수 있다. 버튼은 누름·호버가 spring 물리로 반응하고 메뉴 항목은 순차로 등장하며, 폼을 닫을 때도 자연스럽게 접힌다. 아코디언은 제목부터 아이콘까지 헤더 전체가 클릭 대상이 되고, 레일 아이콘도 다른 아이콘 버튼과 똑같이 툴팁을 갖는다.

## User Stories

1. As a 사용자, I want URL 매치 방식을 바꿔도 셀렉트 폭이 그대로이기를, so that 옆의 패턴 입력이 밀리지 않는다
2. As a 사용자, I want 셀렉트가 가장 긴 라벨도 잘리지 않고 담기를, so that 선택한 값을 항상 읽을 수 있다
3. As a ko 로케일 사용자, I want 한국어 라벨에서도 폭이 안정적이기를, so that 로케일에 따라 레이아웃이 달라지지 않는다
4. As a 사용자, I want 헤더 이름 자동완성이 앱의 다른 팝업과 같은 모양이기를, so that 브라우저마다 다른 기본 UI에 당황하지 않는다
5. As a 키보드 사용자, I want 자동완성 제안을 화살표로 이동하고 Enter로 고르기를, so that 마우스 없이 입력을 마칠 수 있다
6. As a 사용자, I want 내가 등록한 자동완성 항목이 표준 헤더보다 먼저 뜨기를, so that 자주 쓰는 이름을 빨리 고른다
7. As a 사용자, I want 자동완성이 입력한 접두에 맞는 후보만 보여주기를, so that 목록을 훑지 않아도 된다
8. As a 사용자, I want 자동완성 팝업을 Esc로 닫되 폼은 열려 있기를, so that 실수로 편집이 취소되지 않는다
9. As a 사용자, I want 스크롤바가 앱 스타일(다크 모드 포함)이기를, so that OS 기본 스크롤바와의 이질감이 없다
10. As a 사용자, I want 프로필이 많아도 사이드바가 가로로 넘치지 않기를, so that 이름이 잘릴지언정 레이아웃이 깨지지 않는다
11. As a 사용자, I want 본문이 길어도 스크롤이 부드럽게 동작하기를, so that 규칙이 많은 프로필도 편히 본다
12. As a 사용자, I want 필수 항목을 비운 채 저장하면 그 입력으로 포커스가 가기를, so that 어디를 고쳐야 할지 찾지 않아도 된다
13. As a 키보드 사용자, I want 포커스가 이동한 뒤 바로 타이핑할 수 있기를, so that 손을 옮기지 않고 고친다
14. As a 사용자, I want 누락이 여러 개면 첫 번째 항목으로 가기를, so that 위에서부터 차례로 고칠 수 있다
15. As a 사용자, I want Redirect의 패턴·치환이 둘 다 비었을 때 패턴으로 먼저 가기를, so that 자연스러운 입력 순서를 따른다
16. As a 사용자, I want CSP 디렉티브가 비었을 때 첫 디렉티브 이름으로 가기를, so that 바로 이름을 채운다
17. As a 사용자, I want 버튼을 누를 때 spring 물리로 반응하기를, so that 조작이 생동감 있게 느껴진다
18. As a 사용자, I want 버튼 호버에도 부드러운 반응이 있기를, so that 클릭 가능한 대상임이 분명하다
19. As a 사용자, I want ⋯ 메뉴가 열릴 때 항목이 순차로 등장하기를, so that 한꺼번에 튀어나오지 않고 눈이 따라간다
20. As a 사용자, I want 삭제를 눌러 '삭제?'로 바뀔 때 부드럽게 전환되기를, so that 확인 단계로 넘어간 걸 인지한다
21. As a 사용자, I want 폼에서 취소·저장을 누르면 폼이 자연스럽게 접히기를, so that 갑자기 사라지지 않는다
22. As a 사용자, I want 저장 중에는 버튼 상태가 보이기를, so that 눌린 것이 반영 중임을 안다
23. As a 모션 민감 사용자, I want reduced-motion에서 모든 새 애니메이션이 꺼지기를, so that 애니메이션 없이 같은 기능을 쓴다
24. As a 사용자, I want 백업·환경설정의 제목을 눌러도 펼쳐지기를, so that 작은 아이콘을 조준하지 않아도 된다
25. As a 사용자, I want 헤더 어디를 눌러도(제목·여백·아이콘) 같은 동작이기를, so that 클릭 대상이 예측 가능하다
26. As a 키보드 사용자, I want 아코디언 헤더가 하나의 포커스 대상이기를, so that Tab이 불필요하게 늘지 않는다
27. As a 스크린리더 사용자, I want 아코디언 헤더가 펼침 상태를 알리기를, so that 지금 열려 있는지 안다
28. As a 사용자, I want 왼쪽 레일 아이콘에 호버하면 이름이 뜨기를, so that 무엇인지 확인할 수 있다
29. As a 키보드 사용자, I want 레일 아이콘에 포커스해도 툴팁이 뜨기를, so that 마우스 없이 같은 정보를 얻는다
30. As a ko 로케일 사용자, I want 레일 툴팁도 한국어이기를, so that 언어가 섞이지 않는다
31. As a 사용자, I want 이 모든 변경 뒤에도 팝업이 빠르게 뜨기를, so that 체감 속도가 나빠지지 않는다

## Implementation Decisions

- **셀렉트 폭 고정**: Select 프리미티브에 폭 제약을 도입한다. 트리거가 선택 라벨에 따라 늘지 않도록 하되, 가장 긴 라벨(매치 방식의 `Regex (advanced)` / ko `정규식 (고급)`)이 잘리지 않는 폭을 기본값으로 삼고, 호출자가 필요 시 조정할 수 있게 한다. 기본 폭은 `src/ui/tokens.ts`에 이름 있는 토큰으로 둔다 — **폭 값의 적정성은 코드가 아니라 en/ko 최장 라벨 미절단 테스트가 지킨다**(아래 Testing Decisions). 트리거의 라벨 요소는 현행 `truncate`를 유지하므로 폭이 모자라면 절단이 `scrollWidth > clientWidth`로 관측된다 — 폭을 좁게 잡아 라벨이 잘리는 회귀는 테스트가 먼저 깨뜨린다. 팝업은 기존처럼 앵커 폭 이상으로 열린다.
- **Autocomplete 채택**: 헤더 이름 입력을 Base UI Autocomplete로 교체한다(ADR 0011의 Base UI 일원화 연장). **후보 산출은 core의 `suggestHeaderNames`가 계속 담당한다** — 사용자 항목 우선, 대소문자 무시 중복 제거, 상한 8개라는 검증된 도메인 규칙과 그 vitest를 보존하기 위해서다. Autocomplete는 렌더링·키보드·팝업 시맨틱만 맡고 자체 필터링에 의존하지 않는다. 팝업 표면은 기존 `popupSurface`/`popupItem` 토큰을 공유한다. Esc는 팝업만 닫고 폼은 유지한다(rule-form의 Esc 처리와 충돌하지 않도록).
- **ScrollArea 채택**: 사이드바와 본문의 네이티브 `overflow-y-auto`를 Base UI ScrollArea로 교체한다. 스크롤바는 앱 토큰으로 스타일링하고 다크 모드를 따른다. 팝업이 고정 크기(760×580)이므로 스크롤바가 콘텐츠 폭을 잠식하지 않도록 처리한다.
- **검증 실패 포커스 (ref 맵)**: rule-form이 `RequiredField`별 입력 ref를 보관하고, 저장이 차단되면 `missingRequiredFields`가 돌려준 배열의 첫 항목에 대응하는 입력으로 포커스를 옮긴다. 매핑은 종류별 렌더 분기와 1:1이다 — 헤더/쿠키 이름, Redirect 패턴, Redirect 치환, CSP는 첫 디렉티브 이름. 헤더 이름은 HeaderNameInput을 거쳐 ref를 전달한다.
- **버튼 모션 통일 (ADR 0012)**: 버튼 프리미티브(Button, IconButton, SwitcherChip, 메뉴 항목)의 누름·호버를 CSS 전이에서 motion의 `whileHover`/`whileTap` spring으로 옮긴다. 이는 **ui-refine 08의 "마이크로 인터랙션은 CSS 유지" 결정을 명시적으로 대체**한다 — 되돌리기 비싸고(전 버튼 프리미티브), 미래 독자에게 반전 이유가 필요하며, 생동감 대 리렌더 비용이라는 실제 트레이드오프의 결과라 ADR로 기록한다. 메뉴 항목은 열릴 때 순차 등장(stagger), 삭제 2단 확인은 라벨 교체에 전환을 준다. 폼 취소·저장은 기존 MotionRow의 height 전이를 활용해 닫힘을 부드럽게 한다. motion 런타임은 이미 초기 번들에 있으므로 컴포넌트 추가분은 미미하다.
- **reduced-motion 관측 계약 (story 23, ADR 0012 경계)**: 새 모션 프리미티브는 전부 `useReducedMotion()`을 읽고, 참이면 **애니메이션 prop 자체를 넘기지 않는다** — `whileHover`/`whileTap`/`variants`/`transition`을 조건부로 미전달하고, 지속시간 0짜리 전이로 대체하지 않는다. motion이 인라인 스타일을 쓰지 않게 되므로 "모션 없음"이 계산 스타일로 관측 가능해진다. 프리미티브별 관측 지점을 다음으로 고정한다:
  - **누름·호버 spring** (Button·IconButton·SwitcherChip) → 호버·포인터다운 중 해당 요소의 computed `transform`이 `none`
  - **메뉴 항목 stagger** → 메뉴를 연 직후 첫 애니메이션 프레임에서 모든 항목의 computed `opacity`가 `1`. stagger 총 지연은 컴포넌트가 소유하는 상수로 두어 테스트가 그 계약을 참조한다
  - **삭제 2단 확인 라벨 교체** → '삭제?' 라벨이 나타난 프레임에 computed `opacity`가 `1`
  - **폼 닫힘** (기존 MotionRow height 전이) → 취소·저장 직후 폼 노드가 exit 창 없이 DOM에서 제거됨
  기존 MotionRow·MotionView는 이미 같은 방식이므로 계약이 새로 생기는 게 아니라 신규 프리미티브로 확장되는 것이다.
- **저장 중 상태 (story 22)**: 저장은 background 왕복(`sendCommand` → `runtime.sendMessage`)이라 지연이 실재한다. 계약을 다음으로 고정한다.
  - **가시 표시**: in-flight 동안 저장 버튼 라벨이 신규 카탈로그 키 `saving`(en `Saving…` / ko `저장 중…`)으로 바뀐다. `disabled` 속성만으로는 상태가 보이지 않으므로 라벨 교체가 story 22의 관측 가능한 표면이다.
  - **반복 제출 차단**: 현행 `disabled={saving}`를 계약으로 고정한다 — in-flight 중 재클릭이 명령을 추가로 보내지 않는다. 취소 버튼도 같이 비활성화해, 응답을 받을 폼이 사라진 뒤 명령이 착지하는 창을 없앤다.
  - **성공 전이**: `result.ok`면 상위가 `setEditingRule(null)`로 폼을 닫고, 닫힘은 MotionRow height 전이를 탄다(story 21). saving 상태는 폼 언마운트로 사라진다.
  - **거부 전이**: `saving`이 false로 돌아가 라벨이 `save`로 복귀하고 버튼이 다시 눌린다. 폼은 열린 채 유지되고 초안은 보존되며, `saveRejected`가 기존 `role="alert"` Alert로 노출된다.
  - 라벨 교체는 텍스트 변경이지 애니메이션이 아니므로 reduced-motion에서도 동일하게 보인다 — 위 관측 계약의 대상이 아니다.
- **아코디언 헤더 전체 트리거**: CollapsiblePanel이 우측 아이콘만이 아니라 헤더 행 전체를 Collapsible 트리거로 만든다. 제목·여백·아이콘 어디를 눌러도 열리고, 포커스 대상은 하나로 유지하며 `aria-expanded`가 펼침 상태를 알린다. 아이콘은 트리거 안의 시각 표시(회전)로 남는다.
- **레일 아이콘 툴팁**: 레일의 세 아이콘을 기존 IconButton으로 교체해 툴팁(호버·키보드 포커스)과 aria-label을 같은 카탈로그 키에서 얻게 한다. 선택 상태 표시는 유지한다.
- **i18n**: 새 사용자 대면 문자열은 en/ko 카탈로그를 경유한다. 레일 툴팁은 이미 있는 `ariaShowProfiles`/`ariaShowBackups`/`ariaShowPreferences`를 재사용한다. 이번에 추가되는 키는 `saving` 하나다(en/ko 양쪽 필수).

## Testing Decisions

좋은 테스트는 외부 행동만 본다 — 렌더 결과·접근성 트리·포커스 위치·스토리지 상태를 검증하고, 컴포넌트 내부 구조는 검증하지 않는다. 신규 시임은 만들지 않는다(이번 작업은 기존 컴포넌트의 상호작용 교체라 core 도메인 로직이 늘지 않는다) — 아래 추가 단언은 전부 기존 시임(smoke·ui-diag) 안에서 이뤄지고, 프로덕션 코드에 테스트 전용 훅을 심지 않는다.

예외 하나를 명시한다: story 23은 "애니메이션이 없을 것"이 곧 요구사항이라, 모션 부재는 계산 스타일로 관측할 수밖에 없다. 이는 내부 구조 검증이 아니라 사용자가 보는 것(움직임의 유무) 자체이며, 그래서 Implementation Decisions가 "reduced-motion이면 애니메이션 prop을 아예 넘기지 않는다"를 계약으로 고정해 관측 지점을 안정시킨다.

- **smoke (Playwright)** — 주 시임. Autocomplete(제안 노출·접두 필터·사용자 항목 우선·화살표+Enter 선택·Esc는 팝업만 닫음 — 기존 L2를 새 팝업 기준으로 재작성), 검증 실패 포커스(`document.activeElement`가 첫 누락 입력, 종류별로 헤더 이름·Redirect 패턴·CSP 디렉티브 이름), 아코디언 제목 클릭으로 열림 + `aria-expanded`, 레일 툴팁(호버·키보드 포커스, en/ko). 선행 예: 기존 N 시리즈(N17 툴팁·N18 검증·N21 reduced-motion). 아래 세 건은 게이트가 통과해도 요구사항이 깨질 수 있는 지점이라 단언을 명시한다.
- **smoke — 셀렉트 폭 (stories 1·2·3)**: 폭 안정성만 보면 라벨이 잘려도 통과하므로 두 단언을 함께 건다. en 팝업과 ko 팝업(`?locale=ko`, 선행 예 있음) 각각에서 매치 방식의 **모든** 옵션을 차례로 선택하며 (a) 트리거의 `getBoundingClientRect().width`가 선택과 무관하게 동일(±0.5px), (b) 각 선택 상태에서 라벨 요소(`BaseSelect.Value`, `truncate` 적용)가 `scrollWidth <= clientWidth + 1`(부분픽셀 허용). (b)가 최장 라벨(en `Regex (advanced)` / ko `정규식 (고급)`)에서 성립해야 하므로, 폭 토큰을 좁게 잡으면 이 단언이 깨진다.
- **smoke — reduced-motion 부재 단언 (story 23)**: 기존 N21은 기능 정상만 보므로 애니메이션이 살아 있어도 통과한다. N21을 확장해 `reducedMotion: 'reduce'`에서 기능 정상에 더해 Implementation Decisions의 관측 지점 네 곳이 **부재**함을 단언한다 — 호버·포인터다운 중 버튼 computed `transform === 'none'`, 메뉴 개방 직후 첫 프레임에 모든 항목 `opacity === '1'`, '삭제?' 라벨 등장 프레임에 `opacity === '1'`, 취소·저장 직후 폼 노드가 exit 창 없이 DOM에서 제거. 여기에 **감도 대조 1건**을 붙인다: 기본 모션(`reducedMotion: null`)에서 같은 프로브가 누름 중 `transform !== 'none'`을 관측한다 — 프로브가 실제로 모션을 감지할 수 있음을 보여, 부재 단언이 "아무것도 구현하지 않아도 통과"로 퇴화하지 않게 한다. 대조가 불안정하면 프로브를 Storybook 시임으로 옮기되 삭제하지 않는다.
- **smoke — 지연 저장 (story 22)**: 저장이 즉시 끝나면 저장 중 상태를 관측할 창이 없으므로 왕복을 인위적으로 늦춘다. 프로덕션 코드는 건드리지 않고 `popup.addInitScript`로 `chrome.runtime.sendMessage`를 감싸 응답을 ~600ms 지연시키고 호출 횟수를 노출한다(저장 경로가 background 왕복이라 이 지점이 유일한 시임이다). 단언: in-flight 중 저장 버튼 라벨이 `Saving…`이고 비활성, 그 동안 재클릭해도 sendMessage 호출이 1회, 응답 후 폼이 닫히고 스토리지에 규칙이 **1건만** 반영. 별도로 거부 응답(`{ok:false}`)을 주입해 폼이 열린 채 남고 라벨이 `Save`로 복귀하며 `Rejected.` alert가 뜨는지 확인한다.
- **vitest (core)** — `suggestHeaderNames`의 기존 테스트를 그대로 유지해 Autocomplete 교체가 후보 산출 규칙을 바꾸지 않았음을 지킨다. 신규 순수 함수는 없다.
- **ui-diag** — ScrollArea 전환 후에도 가로 오버플로 0을 유지하는지 확인한다. 현행 "내부 스크롤러 0" 검사는 `overflow-x: auto|scroll`인 요소를 찾는데 ScrollArea의 viewport가 여기 걸릴 수 있으므로, 검사를 "의도된 ScrollArea viewport는 제외하고 그 외 가로 스크롤러가 없을 것"으로 조정한다. 조정 사유를 스크립트에 남긴다.
- **ui-diag — 팝업 시작 성능 (story 31)**: bundle-gate는 바이트만 재므로 한도 안에 있으면서도 첫 페인트가 느려질 수 있다(이번 변경은 전 버튼을 motion 컴포넌트로 바꾸고 ScrollArea·Autocomplete의 런타임 작업을 추가한다). ui-diag는 이미 실 확장·실데이터·Playwright를 갖췄으므로 여기에 측정을 얹는다.
  - **지표 둘**: (a) 첫 렌더 — 팝업 문서의 `performance.getEntriesByName('first-contentful-paint')[0].startTime`, (b) 상호작용 준비 — 문서 시작부터 `Add rule` 버튼이 존재하고 활성화될 때까지를 **페이지 내부** `performance.now()`로 측정(Playwright 왕복 지연을 지표에 섞지 않는다).
  - **절차**: 기존 richState를 그대로 쓰고 콜드 로드 5회(매회 새 페이지), 워밍업 1회는 버리고 **중앙값**을 채택한다.
  - **기준선**: 변경 전 빌드에서 같은 스크립트를 같은 기기로 돌려 `docs/reviews/ui-polish/perf-baseline.md`에 기기·중앙값·5회 원값을 기록한다.
  - **예산**: 중앙값이 `기준선 × 1.3`과 `기준선 + 150ms` 중 **큰 값**을 넘으면 실패(exit 1). 배수만 쓰면 작은 절대값에서 과민해지고 절대값만 쓰면 느린 기기에서 무뎌지므로 병용한다. 기준선 파일이 없으면 측정치만 출력하고 실패시키지 않는다 — 기준선 없는 상태의 거짓 실패를 막는다.
  - **한계 명시**: 기기 의존적이라 CI의 절대 게이트가 아니다. 유효한 비교는 **같은 기기에서 기준선 대비**뿐이며, 티켓마다 측정치를 기록해 어느 변경이 지연을 늘렸는지 드러낸다.
- **bundle-gate** — ScrollArea·Autocomplete 추가분이 한도 안인지 측정한다. **초과 시 한도를 먼저 올리지 않는다** — 지연 로드나 대안(예: Autocomplete 대신 기존 datalist 유지)을 검토하고, 그래도 불가하면 사용자 재트리아지를 거친다. 이 게이트는 바이트만 재므로 story 31의 근거가 되지 못한다 — 런타임 지연은 위 ui-diag 시작 지표가 담당한다.
  - **재트리아지 결과 (티켓 02, 한도 +120KB → +135KB).** 실측: ScrollArea +12.6KB, Autocomplete +14.5KB — **어느 하나만 넣어도** 기존 한도를 넘었다(각각 +129.5KB, +131.4KB). ScrollArea는 초기 셸이라 지연 로드가 불가하고, 네이티브+CSS 대안은 스크롤바가 오버레이가 아니라 콘텐츠 폭을 잠식해 위 구현 결정과 충돌한다. 반면 ScrollArea 도입 후 ui-diag 시작 지표는 first paint 60.0ms(기준선 64.0)·dom ready 37.9ms(기준선 36.7)로 **회귀가 없었다** — 대리 지표(바이트)와 직접 지표(시작 시간)가 엇갈렸고 직접 지표를 채택했다. 사용자가 한도 +135KB를 승인했다.
  - **Autocomplete는 지연 로드가 조건이다.** 규칙 폼 안에서만 쓰이므로 초기 청크에 있을 이유가 없다(dnd-kit 분리 선행 예). 티켓 03의 수용 기준에 들어갔고, 지연 로드가 불가로 판명되면 그때 다시 재트리아지한다 — 한도를 또 올리는 것이 기본값이 아니다.
- **storybook build** — 교체·신규 프리미티브(Select 폭 변형, Autocomplete, ScrollArea, 모션 버튼)의 렌더 게이트.

## Out of Scope

- 새 규칙 종류·조건 차원 추가 (ADR 0010 유지)
- 자동완성 사전 자체의 확장(표준 헤더 목록 변경)
- 규칙 행의 드래그 재정렬 (프로필만 — ui-refine 06 유지)
- Import/Export 문자열의 카탈로그화 (기존 별도 과제)
- Firefox 등 다른 브라우저 대응

## Further Notes

- 이번 작업은 ui-refine의 후속 다듬기다. ADR 0011(Base UI 일원화)의 연장선이며, ADR 0012가 그중 "마이크로 인터랙션은 CSS" 부분만 대체한다.
- bundle-gate 여유가 3KB로 얇다. ScrollArea와 Autocomplete를 도입하는 티켓에서 각각 측정치를 기록해, 어느 쪽이 한도를 압박하는지 드러나게 한다. 같은 티켓에서 ui-diag 시작 지표(첫 렌더·상호작용 준비 중앙값)도 함께 기록한다 — 바이트와 지연이 항상 같이 움직이지는 않으므로, 둘을 나란히 남겨야 어느 도입이 무엇을 압박했는지 사후에 갈라낼 수 있다.
- 모션 전면 도입은 팝업 첫 페인트에 가장 민감한 변경이다(ADR 0012의 트레이드오프 항목). 시작 지표 기준선은 이 티켓들 **이전에** 떠 둬야 의미가 있다.
- 문서·코드 전반에서 레퍼런스 제품 브랜드명을 쓰지 않는 기존 원칙을 유지한다.
