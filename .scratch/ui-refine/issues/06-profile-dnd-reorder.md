# 06 — 프로필 드래그 재정렬 (dnd-kit)

**What to build:** 사이드바 프로필 항목의 그립을 드래그해 순서를 바꾼다 — 드롭은 기존 move-profile 명령으로 귀결되어 겹침 승자가 실요청에 반영된다. 키보드로는 그립 포커스 → Space 집기 → 화살표 이동 → Space 드롭이 동작하고(Esc는 취소·원순서 복귀), 포커스는 조작 내내 그립에 유지된다(sortable 좌표 전략, plan r1 R-2). ⋯ 메뉴의 위/아래 이동은 제거되어 복제·삭제만 남는다.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] 마우스 드래그 재정렬 → 순서·겹침 승자 실반영 (smoke N8, 기존 메뉴 이동 시나리오 대체)
- [x] 키보드 재정렬: Space 집기→화살표→Space 드롭 반영, Esc 취소 시 원순서·포커스 그립 유지 (smoke N8, plan r1 R-2)
- [x] 메뉴에 위/아래 이동 없음 — 복제·삭제만 (smoke N8)
- [x] 전 게이트 green — tsc 0 · vitest 199 · build · smoke 75/75 ×3 · storybook · diag

## 리뷰 반영 (2축)

- **검증 갭 해소(AC2, plan r1 R-2):** Esc 취소 시 원순서 복귀·포커스 그립 유지를 smoke N8에 추가(리뷰가 미검증 지적).
- 수정: 검색 중엔 그립 없는 StaticItem 렌더(비활성 그립 어포던스 오해 제거), focusRing 토큰 추출 후 Button·SwitcherChip·그립 통일(그립의 outline-offset-1 불일치 해소), @dnd-kit/modifiers 미사용 제거.
- 검증: 드롭은 move-profile 명령으로 귀결(상태 로직 무변경), toIndex는 전체 목록 기준(검색 중 재정렬 비활성이라 안전), KeyboardSensor는 sortableKeyboardCoordinates 사용.

## 번들 게이트 (plan r1 R-3) — 티켓 08로 이월

dnd-kit(core+sortable) 도입으로 popup 공용 초기 청크가 386.0KB → **495KB(min, +109KB)**. plan r1 R-3의 +60KB 게이트를 초과한다. 번들 게이트 최종 판정과 지연 로드(LazyMotion + 필요 시 dnd 코드 분할)는 **티켓 08의 AC**이므로 거기서 처리한다 — 이 델타를 08 착수 시 기준으로 삼는다.
