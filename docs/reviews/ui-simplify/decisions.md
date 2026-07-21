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

### structure r2

- verdict: approve (findings 0) — S-1 해소 재확인, 신규 critical 없음. 게이트 통과.

### release r1

- R-1 defer — New screen-reader labels bypass the en/ko catalog; 부분 지역화의 비일관 + 릴리스 직전 smoke 셀렉터 전면 churn 회피. 신규+기존 aria 일괄 i18n을 후속 이슈로 발행: .scratch/aria-label-i18n/issues/01-aria-catalog.md
- R-2 accept — Verification claims full matrix coverage despite acknowledged gaps (Export smoke N13 추가 + verification.md 정직화·재생성으로 해소)

### release r2

- verdict: approve (findings 0) — R-1 defer 정직 기록+후속 이슈, R-2 N13 실다운로드 검증으로 해소 확인. 신규 critical 없음. 게이트 통과.
