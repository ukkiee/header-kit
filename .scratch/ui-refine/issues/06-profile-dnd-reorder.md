# 06 — 프로필 드래그 재정렬 (dnd-kit)

**What to build:** 사이드바 프로필 항목의 그립을 드래그해 순서를 바꾼다 — 드롭은 기존 move-profile 명령으로 귀결되어 겹침 승자가 실요청에 반영된다. 키보드로는 그립 포커스 → Space 집기 → 화살표 이동 → Space 드롭이 동작하고(Esc는 취소·원순서 복귀), 포커스는 조작 내내 그립에 유지된다(sortable 좌표 전략, plan r1 R-2). ⋯ 메뉴의 위/아래 이동은 제거되어 복제·삭제만 남는다.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 마우스 드래그 재정렬 → 순서·겹침 승자 실반영 (smoke — 기존 메뉴 이동 시나리오 대체)
- [ ] 키보드 재정렬: Space 집기→화살표→Space 드롭 반영, Esc 취소 시 원순서, 포커스 그립 유지 (smoke, plan r1 R-2)
- [ ] 메뉴에 위/아래 이동 없음 — 복제·삭제만 (smoke)
- [ ] 전 게이트 green
