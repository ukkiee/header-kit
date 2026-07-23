# ui-polish gate decisions

### plan r1

- R-1 accept — Reduced-motion acceptance does not verify that motion is disabled
- R-2 accept — Fixed-width test permits clipped labels and locale regressions
- R-3 accept — Saving-state story has no implementation or verification contract
- R-4 accept — Popup performance acceptance is not measurable

### plan r2

- 발견 0건 — verdict approve. R-1~R-4 전부 resolved로 재검증됐고, 수정이 새로 들인 critical·high 이슈 없음. 트리아지할 행 없음.

### bundle-gate 재트리아지 (티켓 02)

- WAIVED by user: 번들 한도 +120KB → **+135KB**. 실측 ScrollArea +12.6KB / Autocomplete +14.5KB로 어느 하나만 넣어도 초과. ScrollArea는 초기 셸이라 지연 로드 불가, 네이티브+CSS 대안은 콘텐츠 폭을 잠식해 구현 결정과 충돌. 반면 ui-diag 시작 지표는 회귀 없음(first paint 60.0 vs 기준선 64.0ms) — 대리 지표보다 직접 지표를 채택. Autocomplete 지연 로드는 티켓 03의 수용 기준으로 남는다.
