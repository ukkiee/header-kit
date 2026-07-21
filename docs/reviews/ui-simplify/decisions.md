# Triage decisions — ui-simplify

### plan r1

- R-1 accept — Open question: selected IDs can become stale after profile mutations
- R-2 accept — Testing decisions omit several release-critical user stories
- R-3 accept — Open question: the 420px chip switcher has no overflow behavior

### plan r2

- R2-1 accept — R-2 remains: acceptance matrix omits critical retained behaviors (story 18–22, 25, 28 행 추가로 해소)
- WAIVED by user: 잔존 건이 인수 매트릭스 문서 보강뿐이라 리스크 낮음 — 라운드 3 재리뷰 없이 게이트 통과 처리

### structure r1

- S-1 accept — Reconciled selection is never committed to application state (커밋-중-렌더 패턴 + 전이 시퀀스 테스트 2종으로 해소; 생성 선택은 커맨드 성공 후 확정으로 전환)
