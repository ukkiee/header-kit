# 02 — 칩·패널 프리미티브 — ToggleGroup·Collapsible + 칩 호버 버그 해소

**What to build:** 리소스 종류·메서드 다중 선택 칩이 Base UI Toggle/ToggleGroup 기반이 되고, 캡션과 컨트롤 그룹을 분리해 "엉뚱한 영역 호버에 첫 칩이 반응"하는 라벨 호버 전파 버그를 구조에서 제거한다. 백업·환경설정 패널은 Base UI Collapsible로 교체되어 열림/닫힘 동작이 동일하게 유지된다 (ADR 0011).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 칩 그룹이 ToggleGroup 기반 — 캡션 영역 호버 시 첫 칩이 반응하지 않고, 올린 칩만 반응 (smoke)
- [ ] 다중 선택 토글·aria-pressed 시맨틱과 저장 결과가 기존과 동일 (smoke — 조건 편집 시나리오 green)
- [ ] 백업·환경설정 패널이 Collapsible로 열림/닫힘 동작 동일 (smoke)
- [ ] 전 게이트 green
