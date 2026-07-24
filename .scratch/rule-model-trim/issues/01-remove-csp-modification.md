# 01 — CSP 수정 종류 제거

**What to build:** 규칙 폼의 Type 셀렉트에서 CSP가 사라지고, 이미 저장·import된 CSP 규칙은 **조용히 버려지되 나머지 규칙·프로필은 온전히 보존**된다. CSP를 컴파일·검증·요약·라벨·i18n에서 전부 걷어낸다. 헤더·쿠키·set-cookie·redirect와 모든 조건 차원은 하나도 바뀌지 않는다. (ADR 0013, 스펙 CSP 제거 절)

**Blocked by:** None — can start immediately. (워킹 스켈레톤 — 이 티켓 완료 후 structure 게이트를 돌린다.)

**Status:** ready-for-agent

- [ ] `Modification` union에서 `'csp'` 멤버와 `CspModification`·`CspDirective`를 제거 — `'csp'` 참조가 남으면 tsc가 에러로 띄운다(제거 누락 그물). `createModification`의 csp 분기도 제거
- [ ] 컴파일에서 CSP를 `Content-Security-Policy` 응답 헤더로 방출하던 경로(`emitCspRule`와 디스패치) 제거
- [ ] 검증에서 `'csp'` 케이스와 `directives` 필수 필드 제거 — 남은 종류(name/pattern/substitution)는 불변
- [ ] UI에서 CSP 흔적 제거: Type 옵션 목록(`RULE_KINDS`), kind→라벨 매핑의 `csp`, CSP 디렉티브 편집기, rule-summary·kind-label·large-editor의 CSP 분기
- [ ] i18n에서 `modCsp`·`ariaCspDirectiveName`·`ariaCspDirectiveValue`를 en·ko 양쪽에서 제거 (parity 유지)
- [ ] **마이그레이션 — 검증 전 필터, 양 경로:** 로드(`parseStoredState`)는 `isProfile` 검증 **전**(backfill 단계), import(`parseImport`)는 `validateProfileEntry` **전**에 csp 수정을 걸러낸다. **버리되 나머지 보존** — 로드는 `createDefaultState()` 리셋 금지, import는 파일 전체 거부 금지. import에 CSP notice 추가하지 않는다
- [ ] **로드 드롭 테스트 (진입점 관통):** `parseStoredState`에 csp+지원 규칙이 섞인 상태 → 리셋 아님, csp만 빠지고 나머지 수정·프로필 메타 보존. 내부 backfill 헬퍼가 아니라 `parseStoredState` 자체로 검증
- [ ] **import 드롭 테스트 (진입점 관통):** `parseImport`에 csp+지원 규칙이 섞인 파일 → `ok:true`, csp만 빠지고 나머지 보존, **CSP notice 없음**. 내부 정규화가 아니라 `parseImport` 자체로 검증
- [ ] 컴파일·검증의 CSP 테스트 정리: `compile-issue03`의 CSP describe 블록, rule-validation의 csp 케이스 제거
- [ ] smoke: N18e(빈 CSP 디렉티브 저장 차단)와 N26의 CSP 포커스 케이스(행 없음·행 있음) 제거, 남은 포커스 매핑은 유지. Type 셀렉트 옵션에 CSP **없음** + 헤더 계열·redirect **있음** 회귀 단언 추가
- [ ] storybook: CSP를 참조하던 kind-label·rule-row 스토리 정리, 빌드 통과
- [ ] `csp_report` 리소스 타입은 **건드리지 않는다** — 리소스 종류 조건 칩에 그대로 남는다
- [ ] 전 게이트 green — tsc 0 · vitest · build · bundle-gate · smoke · storybook · ui-diag
