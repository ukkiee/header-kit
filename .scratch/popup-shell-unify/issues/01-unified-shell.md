# 01 — 팝업·탭 단일 셸 통일

**What to build:** 팝업을 ~760×580으로 넓혀 탭 앱과 100% 동일한 셸(레일 + 검색 사이드바 + 본문)을 렌더한다. 칩 스위처와 팝업 하단 접이 패널 배치는 퇴역한다. 표면 차이는 "탭에서 열기" 버튼과 크기뿐. 근거: ADR 0005.

**Blocked by:** None — can start immediately.

**Status:** done — commit f3e8132

- [x] 팝업이 레일+사이드바+본문 셸로 렌더된다 (760×580, 본문·사이드바 독립 스크롤) — 렌더 감사 6샷
- [x] 팝업에서 사이드바 검색(N12b)·선택(N1·N11), 레일 화면 전환(I·L2 경유)이 동작한다 — aria 규약 공유로 프로필 선택 계열 무수정 green
- [x] 백업·환경설정 smoke 시나리오가 팝업 레일 경유 경로로 green (I1/I2, L2)
- [x] ProfileChips 퇴역(+SwitcherChip pill 변형 사장 제거), 전 게이트 green (tsc0·vitest171·build·smoke67/67·storybook·diag exit 0)

참고: code-review 2축 반영 — 사이드바 14rem 복원(의도 밖 탭 변화 제거), ADR 0004 부분 대체 각주, 칩 잔재 주석·smoke 명명 정리, 팝업 검색 smoke 보강.
