# rule-model-trim gate decisions

### plan r1

- R-1 accept (+ 로드 경로까지 확장) — Open question: CSP filtering must precede import validation. 리뷰어는 import(user story 9)만 짚었으나, 코드 확인 결과 로드 경로(`parseStoredState`)도 같은 순서 문제이며 더 심각하다(csp가 `isProfile`을 거부 → `createDefaultState()`로 **전체 상태 리셋**, user story 8). 그래서 스펙에 (1) csp 제거를 **검증 게이트보다 먼저** 두는 것을 양 진입점(로드 backfill 전 / import validateProfileEntry 전)에 명문화, (2) 테스트를 내부 헬퍼가 아닌 `parseStoredState`·`parseImport` **진입점 관통**으로 강제하도록 반영했다.

### plan r2

- 발견 0건 — verdict **approve**. R-1이 양 경로(로드·import)에서 resolved로 재검증됐다: 검증 전 필터 순서가 명확하고, `parseStoredState`·`parseImport` 진입점 관통 테스트가 강제됐다(리셋/거부 없음·나머지 보존·import notice 없음). 스펙 수정이 새로 들인 critical·high 없음. **플랜 게이트 통과 — 다음은 /to-tickets.**
