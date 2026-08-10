# Review Decision Log — rule-accordion-ui

### plan r1 (codex)

사람 결정: `as proposed` — 세 행 모두 accept. 트리아지 전에 세 건의 코드 주장을 저장소에서
직접 확인했고 3/3 사실이었다.

R-1 accept — Response Cookie changes meaning without a version boundary
R-2 accept — Condition retirement has no persistence or notification lifecycle
R-3 accept — Open question: HEAD·CONNECT·OTHER 조건을 어떻게 처리하는가

**세 건이 한 지점으로 모였다.** R-1이 포맷 v3를 강제하는데, 버전이 오른 읽기 결과만이
쓰기로 이어지고 그 쓰기가 쓰기 문을 지나 Writer Lane에서 직렬화되며 버전 숫자 자체가
멱등을 준다. 그래서 R-2의 "동일 버전 읽기에는 커밋 경로가 없다"와 R-3의 "메서드 셋의
거처가 없다"가 **같은 한 번의 v2→v3 변환**으로 함께 풀린다. 스펙은 그 변환을 이 피처의
모든 파괴적 변경이 지나는 단 하나의 문으로 다시 썼다.

확인한 사실:

- R-1 — `SetCookieModification`은 `{ value, mode, emptyMeans }`뿐이고 `value`가 Set-Cookie
  한 줄 전체다(`model.ts:110`, `rule-summary.ts:121`). 그 필드의 **뜻**을 바꾸는 변경이라
  기본값 백필로 보존할 수 없다. 초안이 "필드를 더하기만 하니 형태 호환"이라고 적은 것이
  틀렸고, 이 프로젝트 자신의 규칙이 이미 "뜻이 바뀌는 변경은 올린다"이다.
- R-2 — 두 주장 다 사실. (a) `readStoredState`가 동일 버전 읽기에 `status:'ok'`를 주는데
  그 상태값에는 "치유했다"는 신호가 없고, 쓰기로 이어지는 것은 `'migrated'`뿐이다
  (`persist.ts:364-369`). (b) `compile(profiles, env)`는 이미 정제된 `Profile[]`을 받으므로
  (`compile.ts:534`) 영향 규칙 수가 경고를 만들 시점엔 사라지고 없다. **초안이 적은
  "로드 컴파일 경고" 기구는 성립하지 않는다** — 공지를 상태에 담는 것으로 바꿨다.
- R-3 — `REQUEST_METHODS`는 9개(`rules.ts:26`), 시안은 6개, 초안은 나머지 셋에 침묵했다.
  리소스 타입과 달리 메서드에는 자연스러운 묶음이 없어(HEAD는 GET의 일종이 아니다) 묶음으로
  덮을 수 없고, 넓어지는 실패가 퇴역 Condition과 같은 부류라 같은 문으로 보냈다. 그 결과
  이 피처의 파괴적 변경 정책이 셋이 아니라 **둘**이 됐다.

R-1의 해소에서 갈린 설계 판단 하나: 옛 원시 Set-Cookie 한 줄을 **엄격한 파서**로 읽어
모호함 없이 갈라질 때만 구조화하고, 아니면 원시로 보존한다. R-1의 body가 지목한 위험
(`Expires`의 쉼표, 값 안의 `=`, 모르는 속성)이 전부 "추측하면 다른 쿠키가 나간다"는 한
가지 실패를 가리키므로, 잘못 파싱하는 것보다 원시로 남기는 편이 낫다고 판단했다. 양쪽 다
**컴파일되어 나가는 헤더가 이전과 같아야 한다**는 것이 수용 기준이다.

### plan r2 (codex)

`ok:true` / needs-attention / 2건. R-1·R-3은 **resolved** 확인, R-2는 still-open, 그리고
r1의 수정이 만들어낸 새 high 하나. 사람 결정: `as proposed` — 두 행 모두 accept.
두 건의 코드 주장을 트리아지 전에 저장소에서 확인했고 2/2 사실이었다.

R2-1 accept — R-2 still open: notice is consumed before acknowledgment
R2-2 accept — New high: v3 migration omits the existing v1→v2→v3 chain

- R2-1 — 스펙이 **자기 스토리와 모순**이었다. 초안이 "화면이 읽어 보여 준 뒤 지운다"고
  적었는데 스토리 64는 "확인할 때까지 남아 있길" 원한다. 팝업은 렌더 직후 닫히는 것이
  정상 동작이라 특히 나쁘다 — 규칙은 이미 넓어진 뒤인데 그 이유를 설명할 유일한 것이
  사라진다. 지우는 주체를 화면에서 **쓰기 문을 지나는 확인 명령**으로 옮기고, 그 쓰기가
  성공한 뒤에만 사라지게 했다. 화면 둘이 열렸을 때의 소비 경합과 확인 쓰기 실패도 함께
  스토리·테스트로 세웠다.
- R2-2 — 확인했고 **지적보다 나빴다**. `migrateStoredStateV1ToV2`가 리터럴 `2`가 아니라
  `SCHEMA_VERSION` **상수**를 찍는다(`persist.ts:296-298`). 상수를 3으로 올리는 것만으로
  v1 데이터가 아무 변환 없이 v3로 라벨링되고, 그러면 v1 사용자의 원시 Set-Cookie가 새
  뜻으로 읽혀 **R-1이 막으려던 실패가 v1 문으로 되살아난다**. 그 함수의 주석이 이미 "두
  단계를 이어 붙이면 v1 사용자도 올라온다"고 예고해 뒀고, 코드가 그 예고를 따르지 않는
  것이 결함이다. 스펙에 v1은 리터럴 2를 찍고 그 결과가 v2→v3를 한 번 더 지난 뒤 검증·
  커밋된다고 명시했다.

**라운드 3은 사람이 명시적으로 지시했다.** 근거: r1·r2 다섯 건 중 넷이 "저장된 데이터가
조용히 망가진다"는 한 부류였고, R2-2는 **r1의 수정이 만들어낸** 결함이다 — 이 영역에서
수정이 새 구멍을 내는 일이 이미 한 번 일어났으므로, 티켓을 썰기 전에 한 번 더 확인한다.

### plan r3 (codex)

사람이 명시적으로 지시한 라운드. `ok:true` / needs-attention / 2건. R2-2의 원래 체인
누락은 **resolved** 확인, R2-1은 still-open(수정이 반쪽이었다), 그리고 그 수정이 만든
새 high 하나. 사람 결정: `as proposed` — 두 행 모두 accept. 두 건의 코드 주장을 트리아지
전에 저장소에서 확인했고 2/2 사실이었다.

R3-1 accept — R2-1 still open: module decision still consumes notice on display
R3-2 accept — New high: v1 retirement runs before legacy filters materialize

- R3-1 — **한 문서 안에서 두 문장이 서로 반대를 말하고 있었다.** r2 수정 때 마이그레이션
  절만 고치고 모듈 목록의 같은 문장("화면이 읽고 지운다")을 그대로 뒀다. 구현자가 모듈
  목록을 따르면 R2-1이 그대로 되살아난다. 모듈 문장을 "화면의 읽기는 부수효과가 없고,
  확인 명령이 성공했을 때만 사라진다"로 고쳤다.
- R3-2 — 코드에서 순서를 확인했다: `validateStoredState:304` → `backfillProfile:194` →
  `migrateProfileFilters:203`, 그리고 이 함수가 레거시 `profile.filters`에서
  `requestMethods`·`initiatorDomains`·`tabDomains`·`expiresAt`를 **만들어 낸다**(`:232-241`).
  즉 진짜 v1 상태에는 퇴역 대상이 아직 없고 검증 도중에 태어난다. 스펙대로 v2→v3를 검증
  앞에 두면 퇴역 게이트가 아무것도 못 찾아 영향 수 0을 내고, 그 뒤 검증이 퇴역 대상을 새로
  만들어 v3로 커밋하며, 마이그레이션은 두 번 다시 돌지 않는다 — 화면에 컨트롤이 없어
  사용자가 지울 수도 없는 조건이 영구히 남는다. 체인을 **v1→v2 도장 → 레거시 필터 실체화
  → v2→v3 퇴역·집계 → 검증 → 커밋**으로 명시했다. 실체화 변환은 `filters` 키가 없으면
  즉시 반환하므로(`persist.ts:204`) 검증 안에서 다시 불려도 무해하다 — 순서만 정하면 되고
  기존 경로를 뜯을 필요가 없다. 테스트 픽스처도 실체화된 조건이 아니라 **레거시 filters를
  담은 진짜 v1**로 바꿨다.

WAIVED by user: r3의 두 accept를 적용한 뒤 재검증 라운드를 면제하고 plan 게이트를 닫는다.
근거 셋. (1) 두 수정 다 기계적이다 — R3-1은 같은 문서 다른 줄에 이미 있는 올바른 문장과
맞추는 일이고, R3-2는 "실체화를 먼저"라는 한 문장과 픽스처 교체다. (2) 세 라운드가 발산이
아니라 수렴했다: r1은 "버전 경계가 없다"는 설계 구멍, r3-2는 함수 두 개의 호출 순서로,
발견의 크기가 라운드마다 작아졌다. (3) 마이그레이션이 첫 티켓이 되면 structure 게이트가 그
직후에 **실제 코드**를 보는데, 호출 순서 같은 성질은 산문보다 코드에서 훨씬 잘 잡힌다.

게이트 종결: plan r1(3건 accept) → r2(2건 accept) → r3(2건 accept) → **waiver로 닫음**.
일곱 건 전부 트리아지 전에 저장소에서 사실 확인했고 7/7 사실이었다. 일곱 중 여섯이 "저장된
사용자 데이터가 아무 신호 없이 망가진다"는 한 부류였고, UI·시안 정합에서는 0건이었다 —
이 피처의 위험이 화면이 아니라 마이그레이션에 있다는 것이 이 게이트의 결론이다.

### structure r1 (codex)

`ok:true` / needs-attention / 3건, 전부 high. 사람 결정: `as proposed` — 세 행 모두 accept.
셋 다 트리아지 전에 저장소에서 확인했고 3/3 사실이었다.

S-1 accept — Parser-certified cookies can still emit different bytes
S-2 accept — The v3 cookie type persists contradictory raw and structured states
S-3 accept — Imports bypass the ordered versioned migration seam ticket 02 must extend

**세 건 다 "아홉 개 슬라이스가 위에 쌓이기 전에 잡아야 할 토대 결함"**이고, 그것이 이
게이트의 존재 이유다. S-2와 S-3은 티켓 06과 02가 직접 딛고 설 코드였다.

- S-1 — 추적해 확인했다. `' ='`는 `indexOf('=')`가 1이라 이름 `' '`로 파서를 통과하고
  왕복도 성립하는데, 컴파일의 빈-쿠키 규칙이 `name.trim()`을 쓰므로 빈 것으로 접혀
  `remove`가 된다. **티켓 01의 핵심 단언을 반증하는 사례.** 뿌리는 "공백뿐인 이름은 쿠키
  이름이 아니다"이므로 파서에서 거부해 원시로 보낸다 — 그러면 받아들인 파스에는 항상 비지
  않은 이름이 있어 두 규칙이 갈라질 수 없다. 마이그레이션→방출을 통으로 보는 회귀 테스트를
  세웠다(왕복 성립만으로는 보존을 보증하지 못한다는 것이 이 건의 교훈이라).
- S-2 — 사실이고 **지금 고쳐야 하는 종류**였다. 원시 보존을 선택 필드로 얹은 탓에 두 표현을
  동시에 든 레코드가 저장소를 통과했고, 컴파일은 원시를 우선하므로 폼이 재료를 고쳐 저장하고
  "성공"이라 말한 뒤에도 옛 줄이 계속 나가는 경로가 열려 있었다. 배타 변형(`StructuredSetCookie`
  / `RawSetCookie`)으로 갈라 **표현조차 못 하게** 했고, 벗어나는 문을 `toStructuredSetCookie`
  하나로 두어 그것이 raw를 지우면서 나가게 했다. 타입만으로는 밖에서 들어온 JSON을 못 막으므로
  저장소 검증도 "정확히 하나"를 강제한다. 타입 체커가 곧바로 `rule-form.tsx` 세 곳을 짚어
  이 결함이 실재함을 증명했다 — 그 세 곳은 재료를 건드리면 원시에서 벗어나도록 고쳤고, 벗어나기
  전의 줄은 안내로 보여 무엇을 대신 놓는 중인지 알 수 있게 했다.
- S-3 — 두 경로의 순서가 **거꾸로**임을 확인했다. 저장소는 실체화→재구조화, 가져오기는
  백필(재구조화)→실체화였다. 쿠키만 다루는 지금은 무해하지만 티켓 02가 여기 퇴역을 얹는
  순간 가져오기 문에서 아직 태어나지 않은 조건을 벗기려 하게 된다 — plan r3 R3-2가 저장소
  문에서 잡았던 실패가 가져오기 문으로 되살아난다. 아이러니하게도 이 배치는 직전
  `/code-review`의 "백필 한 곳" 권고를 따른 결과였다. `upgradeProfile` 하나로 순서를 못박고
  두 문이 그것을 지나게 했다.

**고치는 과정에서 제 회귀 하나를 스스로 만들고 잡았다**: 올린 뒤 검증하도록 바꾸자 실체화가
필터 키를 걷어 가 **무효한 레거시 필터가 거부되지 않고 조용히 삼켜졌다**. 기존 테스트가
red로 잡았고, 레거시 필터는 올리기 전 모양으로·나머지는 올린 뒤 모양으로 보도록 갈랐다.

### structure r2 (codex)

`ok:true` / needs-attention / 1건. S-1·S-3은 **resolved** 확인, S-2는 still-open이고 더
날카로워졌다. 사람 결정: `as proposed` — accept. 주장을 트리아지 전에 저장소에서 확인했다.

S2-1 accept — S-2 still open: authoritative commands bypass cookie variant validation

- 확인한 사실: `onCommand`가 메시지를 `Command`로 **캐스팅만** 하고(`stateStore.ts:244`),
  `persistState`는 **기존 값의 가독성만** 볼 뿐 새 상태가 온전한지는 보지 않았다(`:93-107`).
  즉 r1에서 타입과 저장소 파서로 세운 배타 불변식이 **권위 쓰기 경계에서는 강제되지 않았다**.
  모순된 레코드가 닿으면 다음 로드의 검증이 실패해 `reset` — 전 프로필이 기본 상태로 교체되고,
  쓴 시점과 잃는 시점이 떨어져 있어 화면에는 아무 설명도 남지 않는다.
- 권고 두 갈래 중 **둘째**를 골랐다: 명령마다 디코더를 붙이는 대신 쓰기 문 한 곳에서 다음
  상태를 검증한다. 종류가 늘어도 빠뜨릴 자리가 생기지 않고, add·update·undo·import·백업
  복원이 전부 자동으로 덮인다. 그리고 이건 **이미 있는 가드의 나머지 반쪽**이다 — "읽을 수
  없는 것 위에 쓰지 않는다"에 "읽을 수 없는 것을 쓰지 않는다"가 없었다.
- 이 가드에서 가장 비싼 실패 방향은 **정상 편집이 막히는 것**(앱이 통째로 쓰지지 않는다)이라,
  두 변형이 다 통과하는지를 명시적으로 단언하는 테스트를 함께 세웠다. 스모크 131/131이
  한 줄도 바뀌지 않고 통과한 것이 그 끝단 증거다 — 그 시나리오들이 추가·수정·삭제·가져오기·
  복원을 전부 지난다.

**라운드 3은 사람이 명시적으로 지시했다.** 근거: 이 수정은 쓰기 문에 가드를 더하는 것이라
영향 범위가 넓고(모든 명령이 지난다), 거부가 잘못 걸리면 스모크가 짜 둔 시나리오만으로는
안 잡힐 수 있다. 또 r1에서 수정이 새 구멍을 낸 전례가 있다(검증 순서를 바꾸자 무효 필터가
조용히 삼켜졌다).

### structure r3 (codex)

사람이 명시적으로 지시한 라운드. **`ok:true` / `verdict: approve` / 발견 0건**
(reviewedSha `ead1fba`, 33파일). 발견이 없으므로 트리아지할 행도 없다.

S2-1 **resolved** 확인. 리뷰어가 짚은 근거: `persistState`가 다음 상태 전체를 검증하고
(`stateStore.ts:108-112`), 배타 검증에 실제로 도달하며(`persist.ts:56-64,108-130,561-565`),
권위 `state` 키에 쓰는 **유일한** 생산 경로가 그 뒤에 있다(`stateStore.ts:124`). 나머지
`storage.local` 쓰기는 전부 생성·필터된 `bk:` 백업 키에 한정된다.

라운드 3을 지시한 이유였던 **거짓 거부** 방향도 함께 확인됐다: 기본 상태·마이그레이션 결과·
가져온 프로필·백업 복원·Placeholder 실체화·undo 복원이 전부 새 가드를 통과한다. 이 가드는
모든 명령이 지나므로 잘못 걸리면 앱이 통째로 쓰지지 않는 상태가 되는데, 그 방향이 비어 있음을
스모크(131/131) 말고 독립적으로 한 번 더 본 것이 이 라운드의 값이다.

**structure 게이트 종결: r1(accept 3) → r2(accept 1) → r3 approve.** 세 게이트 중 사람 면제
없이 닫힌 첫 게이트다(plan은 waiver로 닫혔다).

### release r1 (codex)

`ok:true` / `verdict: needs-attention` / 발견 3건 (reviewedSha `50214c0`, reviewedTree
`2bf30ac5`, 113파일, effort xhigh, inputMode self-collect, headMoved·planDrift 둘 다 false).
사람 트리아지 — **as proposed로 라운드 종결**. 제안 결정은 세 건을 코드로 독립 검증(건별
3렌즈: 재현·인용 감사·반박)한 뒤 세웠고, 세 건 모두 리뷰어 본문에 코드와 다른 부분이 있어
심각도가 high/high/medium → medium/low/low로 내려갔다.

R-1 accept — 빈 Response Cookie 폼이 모든 Set-Cookie를 제거한다
R-2 accept — 퇴역 조건이 현재 v3 상태에서 계속 숨은 DNR 조건으로 적용된다
R-3 defer — v1 마이그레이션 통합 테스트가 요구된 데이터 변환을 싣지 않는다

**R-1 — 리뷰어가 적은 범위 그대로는 채택하지 않았다.** 권고("새 구조화 변형에는 이름과 값을
필수로")를 그대로 넣으면 `rule-validation.ts:7`이 이유까지 적어 둔 유효 사용례(서버 Set-Cookie
차단, ui-refine 스토리 6)가 죽고 `compile-issue03.test.ts:68-75`·`:197-210`(v2→v3 동치)이
깨진다. set-cookie 분기는 `git diff main...HEAD` 기준 main과 글자까지 같아 이 브랜치의 회귀도
아니다. 이 브랜치에 귀속되는 것만 접었다:
  (a) **ADR 0017이 스스로와 어긋나 있었다** — `:23`이 "응답 쿠키에는 필수 필드가 없어 그대로
      저장을 통과한다"를 티켓 06 수정의 **근거**(현재형 전제)로 쓰는데 아래에서 "쿠키 값은
      필수가 된다"고 적었다. 리뷰어는 뒤쪽만 인용했다. 실제 기준("이름·값이 둘 다 비었는데
      속성이 채워져 있으면 막는다")으로 개정.
  (b) **속성만 채운 응답 쿠키가 사용자 입력을 통째로 버리고 무경고 전역 제거가 됐다.**
      `compile.ts`의 빈 판정(`name.trim()==='' && value===''`)이 줄을 조립하지 않으므로 Domain·
      Path·Max-Age·SameSite·Secure·HttpOnly가 사라지는데, 폼을 다시 열면 그 값들이 남아 있다.
      티켓 01의 v3 재구조화가 재료를 칸으로 가르면서 **비로소 표현 가능해진** 상태다 — main은
      값 칸이 하나라 "속성만 채운다"가 존재할 수 없었다. `setCookieIssues`로 그 한 갈래만 막고,
      완전히 빈 초안(차단 사용례)과 원시 보존은 그대로 통과시킨다. **컴파일 의미론은 무변경**.
  낡은 픽스처도 함께 고쳤다 — 옛 케이스는 `name` 키가 아예 없는 v2 모양을 `as Modification`으로
  캐스팅해, 이 발견이 말하는 "v3 구조화의 이름·값이 둘 다 빈" 경우를 한 번도 덮지 못했다.

**R-2 — 사실 관계 셋을 정정한 뒤 접었다.** 리뷰어 본문의 오류: (1) `requestMethods`는 퇴역
조건이 **아니다** — 퇴역한 것은 값 셋(head·connect·other)뿐이고 조건 자체는 살아 있어 폼이
여섯을 그린다. 권고대로 이 매핑까지 걷으면 스모크 E3가 재는 살아 있는 기능이 죽는다.
(2) 남아 있던 것은 넷이 아니라 **둘**이다 — `tabDomains`·`expiresAt`은 `compile.ts`에 등장하지
않는다. (3) 도달 경로가 없다 — 로드·가져오기·백업 복원·sync 복원·폼 저장 다섯 문이 전부
벗기기를 지나므로 남는 입구는 devtools 손편집뿐이라 high가 아니라 low다.
그럼에도 접은 이유: **스펙 미이행이 진짜이고 티켓 사이로 빠졌다.** `spec.md:157`이 "컴파일
(core) — 퇴역한 Condition 넷의 매핑은 걷어낸다"를 명시하는데 둘이 남았고, 티켓 02의 재개
노트가 이 철거를 티켓 10에 넘겼는데 티켓 10의 AC 아홉에 그 항목이 없다 — 티켓 10이 마지막이라
잡을 티켓이 남지 않았다. 게다가 `model.ts:38-47`("업그레이드 입력에만 나타난다")과
`compile.ts`가 같은 브랜치 안에서 서로를 반박하고 있었다.
방향은 **코드를 스펙에 맞추는 쪽**을 골랐다(반대로 스펙을 개정하는 선택도 성립했다). ADR
0017의 퇴역 결정에 "컴파일이 그 넷을 읽지 않는 것이 두 번째 방어선"을 명문화하고, Request
Method는 포함되지 않는다는 경계를 함께 적었다 — 두 문서가 갈라진 채 머지되지 않게 하는 것이
이 accept의 핵심이다.
리뷰어의 "통과 증거가 요구사항과 반대다"는 과독이다 — `compile.test.ts`의 그 케이스는 main에서
그대로 온 사실 진술이고, 바로 아래에 티켓 10 방향의 단언이 이미 서 있었다. 단언은 **지우지
않고 방향만 뒤집었다**(입력은 남기고 부재를 잰다). 리뷰어가 적은 것보다 표면이 넓어
`compile.test.ts`·`compile-filters.test.ts`·`block-kind.test.ts` 셋을 함께 고쳤다.

**R-3 defer — 진술된 형태로는 틀렸다.** 리뷰어는 이 체인이 시험되지 않는다고 했으나, 스펙
Testing Decisions의 "**v1 체인 테스트 (core)**"가 요구한 픽스처가
`schema-version.test.ts:292-314`의 `realV1()`에 **빠짐없이** 있다 — 원시 set-cookie +
`request-method: ['head','connect','other']` + `initiator-domain` + `tab-domain` + `time`,
감도 대조용 `resource-type`까지. 스펙이 runtime에 준 몫은 "커밋이 쓰기 줄을 지나 직렬화·재시도·
재시작·겹친 명령"뿐이라 통합 픽스처가 얇은 것은 설계다. 제품 코드 결함도 도달 가능한 실패도
없다.
**그러나 defer이지 reject가 아닌 이유**: 스펙의 그 항목은 "권위 저장소에 v1 상태를 심고 …
커밋이 쓰기 줄을 지나고 재시도되는지"까지 한 묶음으로 요구했는데, 리치 픽스처는 순수
`readStoredState` 테스트에만 있고 저장소·레인 테스트(`stateStore.test.ts`의 `V1`, 통합의
`StoredV1`)는 request-header 전용이다. 단언들이 각각 어딘가에 있을 뿐 리치 픽스처가 저장소
문과 레인까지 가지는 않는다. 회귀 감시의 공백이지 현재 결함이 아니므로 머지 차단 사유가
아니고, 후속 보강으로 남긴다 — `StoredV1`에 필터 한 종류를 허용하고 `v1StateTwoProfiles`에
`tab-domain` 하나를 얹어 `stored.retirementNotice`를 단언하면 한 줄로 닫힌다.

**돌연변이로 이빨을 확인했다.** 걷어낸 매핑을 되살리면 3파일 5건이 붉어지고(`compile.test`
1 · `compile-filters.test` 3 · `block-kind.test` 1), `setCookieIssues`의 게이트를 무력화하면
새 케이스가 붉어진다. 원복하면 624/624.

### release r2 (codex)

**`ok:true` / `verdict: approve` / 발견 0건** (reviewedSha `e409567`, reviewedTree `52d76749`,
114파일, effort xhigh, headMoved·planDrift 둘 다 false). 발견이 없으므로 트리아지할 행도 없다.

R-1 · R-2 **resolved**, R-3의 defer 사유도 재론되지 않았다. 라운드 2의 두 번째 과업("수정이
새로 만든 critical·high")도 0건이다 — 이 브랜치에서 가장 조마조마했던 자리가 거기였다.
`conditionFor`에서 조건 매핑을 걷는 것은 **방출되는 규칙의 모양을 바꾸는** 수정이고,
`fieldIssues`에 갈래를 더하는 것은 **저장을 막는 문**을 좁히는 수정이라 둘 다 과하면 살아 있는
기능을 죽인다. r1 트리아지에서 리뷰어 권고를 그대로 받지 않고 범위를 정정한 판단(값 필수화 거부,
Request Method 매핑 보존)이 여기서 반증되지 않았다.

**릴리스 게이트 종결: r1(accept 2 · defer 1) → r2 approve.** 사람 면제 없이 닫혔다.

## 세 게이트 최종

| 게이트 | 라운드 | 종결 |
|---|---|---|
| plan | r1 needs-attention(accept 3) → r2 needs-attention(accept 2) → r3 needs-attention(accept 2) | **사람 waiver** — 근거 3개 위에 기재 |
| structure | r1 needs-attention(accept 3) → r2 needs-attention(accept 1) → r3 **approve** | 면제 없이 |
| release | r1 needs-attention(accept 2 · defer 1) → r2 **approve** | 면제 없이 |

세 게이트 중 둘이 `approve`로 닫혔고, plan 하나만 waiver로 닫혔다.
