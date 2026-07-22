# 07 — 규칙 삭제 Undo 토스트

**What to build:** 규칙 삭제는 즉시 실행되고, 토스트에서 실행 취소할 수 있다. 삭제 시점에 {Modification 원본, 원래 인덱스, 해당 materialized 값} 3요소를 스냅샷하고, Undo는 단일 명령으로 이를 원자 복원한다 — 일반 추가 경로를 타지 않으므로 Placeholder 규칙도 재실체화 없이 삭제 전과 동일한 실행 상태(materialized 값·실요청 헤더)로 돌아온다 (plan r1 R-1). 프로필 삭제의 2단 확인은 그대로다.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] 원자 복원 명령(restore-modification): 스냅샷 {원본, 삭제 시점 인덱스, materialized 값}으로 원위치·원상태 복원, 재실체화 없음 — Placeholder 값·uuid가 삭제 전과 동일 (vitest, uuidCalls 검증)
- [x] 삭제 → 토스트 Undo → 실요청 헤더 값이 삭제 전과 동일 (smoke N20a)
- [x] Undo 미클릭 시 삭제 유지, 프로필 삭제 2단 확인은 기존대로 (smoke N20b)
- [x] 전 게이트 green — tsc 0 · vitest 202 · build · smoke 77/77 ×3 · storybook · diag

## 리뷰 반영 (2축)

- **하드 위반 수정:** Close 버튼 제거 — aria-label 하드코딩(카탈로그 미경유) + `×` 글리프 + 스코프 초과를 한 번에 해소. 토스트는 자동 소멸(기본 수명)과 Undo 클릭으로 닫히므로 수동 Close 불필요.
- 수정: 토스트 표면 dark 보더를 popupSurface 계열(zinc-800)로 정렬, shadow는 "임의 페이지 콘텐츠 위 전역 알림이라 명도만으로 분리 안 됨" 카브아웃을 주석에 명시(ADR 0004 무그림자 규칙의 문서화된 예외), toast.stories 추가.
- **Spec stale-index 갭:** restore 인덱스는 "삭제 시점 목록 기준"임을 명시(주석+vitest 클램프 케이스). 인터리브 undo 시 원위치 부정확 가능하나 토스트 수명이 짧아 단일 삭제→즉시 undo가 압도적이고 그 경로는 정확. 클로저는 per-call const라 다발 삭제 스냅샷은 충돌 없음(리뷰 확인).
