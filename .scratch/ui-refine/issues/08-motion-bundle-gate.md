# 08 — motion 전면 적용 + 번들 게이트

**What to build:** 앱 전체가 하나의 모션 언어를 갖는다 — 규칙 행 추가/삭제 enter/exit, 폼·조건 disclosure 열림, 레일 화면 전환, 스위치·칩 마이크로 인터랙션까지 일관 적용한다. LazyMotion으로 초기 번들을 억제하고, prefers-reduced-motion을 존중하며, 드래그 애니메이션은 dnd-kit에 위임한다(이중 적용 금지). 번들 게이트를 최종 판정한다: popup 초기 JS 청크 합계 증가가 기준선(popup 엔트리 145B + 공용 386.0KB min) 대비 +60KB(min) 미만이어야 하며, 초과 시 지연 로드 구조를 재검토한다 (plan r1 R-3).

**Blocked by:** 01–07 전부 — 모든 UI 마크업이 확정된 뒤 마지막.

**Status:** ready-for-agent

- [ ] 행 추가/삭제·폼/disclosure·화면 전환·마이크로 인터랙션에 모션 적용 — 기능 회귀 없음 (smoke 전체 green)
- [ ] prefers-reduced-motion 설정 시 애니메이션 없이 동일 기능 (smoke 또는 diag)
- [ ] 번들 게이트: popup 초기 JS 증가 +60KB(min) 미만 — 측정치를 티켓에 기록 (build)
- [ ] 전 게이트 green
