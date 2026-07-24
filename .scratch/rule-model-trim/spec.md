<!-- Status: ready-for-agent -->
# rule-model-trim — 규칙 모델 다듬기 (Initiator 라벨 정리 + CSP 제거)

## Problem Statement

규칙을 편집하는 사용자가 두 가지에서 걸린다.

1. **"Initiator 도메인" 조건이 무슨 뜻인지 와닿지 않는다.** 영어 전문용어(Initiator) + 한국어의 어색한 조합이고, 바로 옆 "탭 도메인"과 노트를 읽어야만 구분된다. 만든 본인도 용처가 바로 떠오르지 않는다.
2. **"CSP" 수정 종류는 쓸 일이 없다.** 개발 중 사이트의 `Content-Security-Policy`를 덮어쓰는 니치 기능인데, Type 셀렉트의 한 자리를 차지하고 디렉티브 편집기·검증·컴파일 분기를 유지하는 비용을 계속 물린다.

## Solution

- **Initiator 도메인 라벨을 명확한 한국어로 바꾼다.** ko `Initiator 도메인` → `요청 출처 도메인`. 노트를 "요청을 실제로 보낸 쪽(임베드된 위젯 등)과 매칭 — 보고 있는 탭과 다름"으로 다듬어 탭 도메인과 대조가 서게 한다. en은 Chrome Network 패널 용어와 일치하는 `Initiator domains`를 유지한다. 기능·동작은 그대로, 카피만 바뀐다.
- **CSP 수정 종류를 제거한다** (ADR 0013). Type 셀렉트에서 사라지고, 디렉티브 편집기·검증·컴파일·i18n·요약·라벨이 함께 걷힌다. 이미 저장돼 있던 CSP 규칙은 로드·import 양 진입점에서 **조용히 버린다**(데이터 손실 감수 — v0.1.0이라 실사용자 영향은 사실상 없다).

## User Stories

1. As a 규칙을 만드는 사용자, I want 조건 "Initiator 도메인"이 한국어로 명확하게 보이기를, so that 무슨 조건인지 노트를 정독하지 않아도 감이 온다.
2. As a 한국어 사용자, I want 그 라벨이 `요청 출처 도메인`으로 뜨기를, so that "요청을 보낸 쪽" 기준이라는 게 이름만으로 전달된다.
3. As a 규칙을 만드는 사용자, I want "탭 도메인"과 "요청 출처 도메인"의 차이가 노트에서 대조되기를, so that 보는 사이트 기준인지 요청 보낸 사이트 기준인지 헷갈리지 않는다.
4. As a 영어 사용자(개발자), I want en 라벨이 `Initiator domains`로 유지되기를, so that Chrome Network 패널의 같은 용어와 교차 참조할 수 있다.
5. As a 기존 규칙을 가진 사용자, I want Initiator 조건이 든 규칙이 라벨 변경 후에도 그대로 동작하기를, so that 카피 변경이 매칭 동작을 바꾸지 않는다.
6. As a 규칙을 만드는 사용자, I want Type 셀렉트에서 CSP가 사라지기를, so that 쓰지 않는 선택지에 시선을 뺏기지 않는다.
7. As a 규칙을 만드는 사용자, I want CSP 관련 UI(디렉티브 편집기·요약·라벨)가 함께 사라지기를, so that 남은 흔적이 "반쯤 제거된" 인상을 주지 않는다.
8. As a 기존에 CSP 규칙을 저장했던 사용자, I want 앱을 다시 열면 그 규칙이 조용히 제거되고 나머지 규칙·프로필은 온전하기를, so that CSP 규칙 하나 때문에 전체 설정이 깨지거나 리셋되지 않는다.
9. As a 프로필 파일을 import하는 사용자, I want 파일에 CSP 규칙이 있어도 그것만 빠지고 나머지가 정상 수용되기를, so that 오래된 파일이 통째로 거부되지 않는다.
10. As a 리소스 종류 조건을 쓰는 사용자, I want `csp_report` 리소스 타입이 그대로 남기를, so that CSP 수정 제거가 무관한 리소스 조건을 건드리지 않는다.
11. As a 개발자, I want `'csp'` 종류를 참조하던 코드가 남으면 컴파일이 실패하기를, so that 제거 누락이 타입 단계에서 드러난다.
12. As a 개발자, I want CSP를 검증·컴파일·요약하던 분기가 전부 걷히기를, so that 죽은 코드가 규칙 모델에 남지 않는다.
13. As a 사용자, I want 규칙 종류가 헤더 계열·redirect로 줄어 멘탈 모델이 간결해지기를, so that 자주 쓰는 종류에 집중할 수 있다.
14. As a 사용자, I want CSP 제거가 헤더·쿠키·redirect·조건(URL 필터·도메인·리소스·메서드) 동작을 하나도 바꾸지 않기를, so that 남은 기능이 그대로 신뢰된다.

## Implementation Decisions

### Initiator 라벨 (i18n 카피 변경)

- `src/core/i18n.ts`의 **ko 카탈로그만** 손댄다: `condInitiator`를 `요청 출처 도메인`으로, `condInitiatorNote`를 탭 도메인과 대조되는 문구로 교체. **카탈로그 키는 그대로**(`condInitiator`, `condInitiatorNote`) — en 값도 그대로. 스키마·컴파일·조건 매칭 로직은 전혀 건드리지 않는다. `initiatorDomains` 도메인 차원 자체는 불변.

### CSP 제거 (ADR 0013)

- **도메인 모델:** `Modification` union에서 `'csp'` 멤버와 `CspModification`·`CspDirective`를 제거한다. `ModificationKind`는 union에서 파생되므로 자동으로 좁혀진다. `createModification`의 `'csp'` 분기 제거.
- **컴파일:** CSP를 `Content-Security-Policy` 응답 헤더로 방출하던 경로(`emitCspRule`와 그 디스패치)를 제거한다.
- **검증:** 규칙 검증에서 `'csp'` 케이스와 `directives` 필수 필드를 제거한다. 다른 종류의 필수 필드(name/pattern/substitution)는 불변.
- **UI:** Type 셀렉트 옵션 목록(`RULE_KINDS`)에서 `'csp'` 제거, kind→라벨 매핑에서 `csp: 'modCsp'` 제거, CSP 디렉티브 편집기 UI·요약(rule-summary)·kind-label·large-editor의 CSP 분기 제거.
- **i18n:** `modCsp`, `ariaCspDirectiveName`, `ariaCspDirectiveValue`를 en·ko 양쪽에서 제거.
- **마이그레이션 — 데이터 손실, 조용히:** 저장 상태 파싱(`parseStoredState`)과 import 파싱(`parseImport`/`normalizeImportedProfiles`)에서 `kind:'csp'` 수정을 **걸러 버린다**(안내 없음). 두 경로 모두 동일 처리. csp를 무효로 취급해 전체 상태를 리셋하는 일이 없어야 한다 — **버리되 나머지는 보존**. import의 기존 "소실 종류 안내(notice)"는 CSP엔 쓰지 않는다(로드와 일치시키는 사용자 결정).
- **경계 — 건드리지 않는 것:** `csp_report`는 declarativeNetRequest **리소스 타입**이지 CSP 수정과 무관하다 — 리소스 종류 조건에 그대로 남는다. 헤더·쿠키·set-cookie·redirect 종류와 모든 조건 차원(URL 필터·매치 방식·initiator/tab/제외 도메인·리소스·메서드·만료)은 불변.

## Testing Decisions

좋은 테스트는 외부 행동만 본다 — 파싱 결과·컴파일 산출 규칙·렌더된 옵션·저장 상태를 검증하고, 내부 함수 구조는 검증하지 않는다. **신규 시임은 만들지 않는다** — 아래는 전부 기존 시임(vitest core·smoke·storybook·tsc) 안이며, 마이그레이션은 **가장 높은 순수함수 지점**에서 관측한다.

- **vitest (core) — 주 시임.** CSP 제거의 핵심을 최상위 순수함수에서 본다.
  - **로드 드롭:** `parseStoredState`에 `kind:'csp'` 수정을 포함한 상태를 넣으면 그 수정만 빠지고 같은 프로필의 다른 규칙·프로필 메타는 온전하다(전체 리셋 아님). 선행 예: 기존 persist 테스트(무효 필드 치유·마이그레이션).
  - **import 드롭:** `parseImport`(또는 `normalizeImportedProfiles`)에 CSP 규칙이 든 파일을 넣으면 그 규칙만 조용히 빠지고 나머지는 수용되며, **CSP에 대한 notice가 추가되지 않는다**(기존 소실-종류 notice와 구분). 선행 예: 기존 transfer/import 테스트.
  - **컴파일:** `compile-issue03.test.ts`의 CSP describe 블록을 제거한다 — CSP 종류가 없으므로 그 컴파일 경로도 없다. 남은 종류의 컴파일은 불변임을 기존 compile 테스트가 계속 지킨다.
  - **검증:** rule-validation의 CSP 케이스 테스트를 제거한다. 남은 종류의 필수 필드 검증은 그대로.
- **smoke (Playwright).** UI가 CSP를 더는 제공하지 않음을 못박는다.
  - **N18e(빈 CSP 디렉티브 저장 차단)를 제거**한다 — 검증 대상 자체가 사라진다.
  - **N26의 CSP 포커스 케이스(행 없음·행 있음)를 제거**한다 — 남은 포커스 매핑(헤더 이름·쿠키 이름·Redirect 패턴·치환)은 유지.
  - **회귀 방지 단언 추가:** 규칙 폼의 Type 셀렉트를 열어 옵션 목록에 CSP가 **없음**을, 그리고 헤더 계열·redirect가 **있음**을 단언한다. 선행 예: 기존 N18c(Type 전환·옵션 관측), N25(셀렉트 옵션 순회).
- **i18n parity (vitest).** en/ko 키 일치 테스트가 `modCsp`·`ariaCspDirective*` 제거 후에도 양쪽에서 대칭으로 빠졌는지, `condInitiator`/`condInitiatorNote` 키는 그대로 남았는지 지킨다. Initiator 라벨은 카피 변경뿐이라 이 테스트가 커버한다. 추가로 smoke에서 조건 필드의 새 라벨 텍스트(`요청 출처 도메인`)를 한 번 단언한다.
- **tsc.** `'csp'` union 멤버 제거로 남은 참조가 전부 컴파일 에러가 된다 — 제거 누락을 잡는 공짜 정합성 그물. 스위트의 `bun run check`가 이를 집행한다.
- **storybook build.** CSP를 참조하던 kind-label·rule-row 스토리를 정리한 뒤에도 빌드가 통과하는지 렌더 게이트로 확인한다.

## Out of Scope

- `initiatorDomains` 도메인 차원의 **동작** 변경 — 라벨/노트 카피만 바꾼다. 매칭 로직·스키마 불변.
- en 라벨 `Initiator domains` 변경 — Chrome 용어와 일치시켜 유지한다.
- CSP 규칙의 **다른 종류로의 변환·이주** — 기계 변환이 무의미하므로 버린다(ADR 0013).
- import의 CSP 드롭에 대한 사용자 **안내(notice)** — 로드와 일치시켜 조용히 버린다.
- `csp_report` 리소스 타입 — CSP 수정과 무관, 유지.
- 다른 조건 차원(탭 도메인·제외 도메인·리소스·메서드·만료)이나 다른 수정 종류의 어떤 변경도 없다.

## Further Notes

- CSP 제거는 규칙 종류를 하나 걷어내는 파괴적 변경이다. 컴파일·검증·UI·i18n·마이그레이션이 얽혀 있으므로 tsc가 누락을 잡는 그물이 되지만, 각 표면을 목록으로 훑어 빠뜨리지 않는 것이 관건이다.
- 마이그레이션의 핵심 함정: csp 수정을 **무효로 취급해 검증 거부**하면 전체 상태가 기본값으로 리셋될 수 있다. 반드시 "**버리되 나머지 보존**"이어야 하며, 로드·import 두 경로 모두 그렇게 동작해야 한다 — 그래서 두 진입점을 각각 테스트한다.
- ADR 0013이 이 결정(제거·마이그레이션·데이터 손실·csp_report 경계)의 정본이다.
