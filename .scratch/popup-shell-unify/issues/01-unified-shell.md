# 01 — 팝업·탭 단일 셸 통일

**What to build:** 팝업을 ~760×580으로 넓혀 탭 앱과 100% 동일한 셸(레일 + 검색 사이드바 + 본문)을 렌더한다. 칩 스위처와 팝업 하단 접이 패널 배치는 퇴역한다. 표면 차이는 "탭에서 열기" 버튼과 크기뿐. 근거: ADR 0005.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 팝업이 레일+사이드바+본문 셸로 렌더된다 (760×580, 본문 스크롤) — 렌더 감사
- [ ] 팝업에서 사이드바 검색·선택, 레일 화면 전환이 동작한다 (smoke — 기존 aria 규약 유지로 프로필 선택 계열 무수정)
- [ ] 백업·환경설정 smoke 시나리오가 팝업 레일 경유 경로로 green
- [ ] ProfileChips 퇴역, 전 게이트 green (tsc·vitest·build·smoke·storybook·diag)
