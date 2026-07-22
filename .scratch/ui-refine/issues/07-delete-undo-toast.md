# 07 — 규칙 삭제 Undo 토스트

**What to build:** 규칙 삭제는 즉시 실행되고, 토스트에서 실행 취소할 수 있다. 삭제 시점에 {Modification 원본, 원래 인덱스, 해당 materialized 값} 3요소를 스냅샷하고, Undo는 단일 명령으로 이를 원자 복원한다 — 일반 추가 경로를 타지 않으므로 Placeholder 규칙도 재실체화 없이 삭제 전과 동일한 실행 상태(materialized 값·실요청 헤더)로 돌아온다 (plan r1 R-1). 프로필 삭제의 2단 확인은 그대로다.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 원자 복원 명령: 스냅샷 3요소로 원위치·원상태 복원, 재실체화 없음 — Placeholder 규칙의 materialized 값이 삭제 전과 동일 (vitest)
- [ ] 삭제 → 토스트 Undo → 실요청 헤더 값이 삭제 전과 동일 (smoke)
- [ ] 토스트를 무시하면 삭제가 유지되고, 프로필 삭제 2단 확인은 기존대로 (smoke)
- [ ] 전 게이트 green
