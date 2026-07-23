# ui-polish gate decisions

### plan r1

- R-1 accept — Reduced-motion acceptance does not verify that motion is disabled
- R-2 accept — Fixed-width test permits clipped labels and locale regressions
- R-3 accept — Saving-state story has no implementation or verification contract
- R-4 accept — Popup performance acceptance is not measurable

### plan r2

- 발견 0건 — verdict approve. R-1~R-4 전부 resolved로 재검증됐고, 수정이 새로 들인 critical·high 이슈 없음. 트리아지할 행 없음.

### structure r1

- S-1 accept — Bundle gate measures only one eager chunk
- S-2 accept — Tab surface cannot satisfy ScrollArea's height contract; 탭 앱이 "페이지 전체 스크롤"에서 "본문만 스크롤"로 바뀌는 것을 감수하기로 사용자가 확인

### bundle-gate 재트리아지 (티켓 02)

- WAIVED by user: 번들 한도 +120KB → **+135KB**. ScrollArea·Autocomplete 어느 하나만 넣어도 기존 한도 초과, ScrollArea는 초기 셸이라 지연 로드 불가, 네이티브+CSS 대안은 콘텐츠 폭을 잠식해 구현 결정과 충돌. ui-diag 시작 지표는 회귀 없음 — 대리 지표(바이트)보다 직접 지표(시작 시간)를 채택. Autocomplete 지연 로드는 티켓 03의 수용 기준으로 남는다. **측정치·경위 정본:** `.scratch/ui-polish/issues/02-scroll-area.md`.
