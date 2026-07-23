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

### structure r2

- 발견 0건 — verdict approve. S-1·S-2 모두 resolved로 재검증, 수정이 새로 들인 critical·high 이슈 없음. 트리아지할 행 없음.
- 유의: 리뷰 샌드박스에서 127.0.0.1 바인딩이 막혀 smoke를 직접 재실행하지 못했다(코드 판독으로 검증). smoke 82/82 및 두 수정의 음성 검증(되돌리면 FAIL)은 로컬 실행 결과가 근거다.

### bundle-gate 재트리아지 (티켓 02)

- WAIVED by user: 번들 한도 +120KB → **+135KB**. (아래 `### release r1`보다 앞선 결정이다 — 시간순은 티켓 02.) ScrollArea·Autocomplete 어느 하나만 넣어도 기존 한도 초과, ScrollArea는 초기 셸이라 지연 로드 불가, 네이티브+CSS 대안은 콘텐츠 폭을 잠식해 구현 결정과 충돌. ui-diag 시작 지표는 회귀 없음 — 대리 지표(바이트)보다 직접 지표(시작 시간)를 채택. Autocomplete 지연 로드는 티켓 03의 수용 기준으로 남는다. **측정치·경위 정본:** `.scratch/ui-polish/issues/02-scroll-area.md`.

### release r1

- R-1 accept — Autocomplete fallback restores the UI the feature promises to remove. 반영 범위는 아래 셋이고, 커밋은 `1e1f294`.
  - **(B) 지연 교체 포커스** — 교체가 리마운트라 새 입력의 `autoFocus`가 포커스를 가져갔다. 청크 응답 900ms 지연으로 재현. 기준을 "포커스를 교체 직전에 폴백이 쥐고 있었는가"로 바꿔 보류만 가능하게 했다. smoke **L2e**(뺏지 않음)·**L2f**(정상 경로에서 잃지도 않음) 양방향.
  - **(A) 실패 경로** — 리뷰어의 "indefinitely"가 맞았다. `pending = null` 리셋을 걷어냈다: 브라우저 모듈 맵이 실패한 fetch를 캐시해 자체 캐시를 비워도 `import()`가 재요청 없이 같은 거절을 돌려준다(실측 — 폼 재개봉 시 요청 누계 1 고정, 문서 새로고침에서 2). 회복은 마운트가 아니라 **문서** 단위다. 진짜 재시도는 불가로 판단 — 해시된 청크 URL을 번들러가 소유해 캐시버스터를 붙일 수 없다. 주석을 실측대로 정정하고 계약은 smoke **L2g**로 옮겼다.
  - **(C) 저하 경로 커버리지** — L2e/L2f/L2g 신설. 셋 다 음성 대조 확인(L2e 수정 전 FAIL, L2f 가드 무조건 끄면 `activeElement=BODY`로 FAIL, L2g 청크 미차단 시 FAIL).
- **범위 밖으로 남긴 것:** 현재 마운트에 대한 재시도 루프. 원리적으로 불가하고(위), 실패가 지속될 때 요청을 반복하는 표면만 새로 생긴다. 리뷰어의 첫 권고인 "폴백에서 네이티브 datalist 제거"도 채택하지 않았다 — 저하 경로에서 제안을 통째로 잃는 쪽이 사용자에게 더 나쁘다고 봤다. **r2는 새 증거 없이 이 둘을 다시 올리지 않는다.**
- **트리아지 정정 기록:** 최초 제안은 (A)를 "다음 마운트에서 재시도되므로 범위 밖"이라 했고 사용자가 그 근거로 승인했다. 실측에서 재시도가 아예 없다는 것이 드러나 근거가 무너졌고, 사용자에게 되가져가 재결정(A-1)을 받았다. 잘못된 전제로 좁힌 범위를 그대로 두지 않았다.

### release r2

- 발견 0건 — verdict **approve**. R-1이 accept한 범위 안에서 resolved로 재검증됐고(실패 경로는 L2g가 저장까지 동작·같은 문서 재요청 없음·새 문서 회복을 고정, 지연 교체는 L2e/L2f가 양방향), 수정이 새로 들인 critical·high 이슈 없음. 트리아지할 행 없음.
- 범위 밖으로 남긴 둘(현재 마운트 재시도 루프, 폴백의 네이티브 datalist 제거)은 r2가 다시 올리지 않았다.
