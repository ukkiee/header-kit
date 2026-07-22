# 03 — 아이콘·툴팁·호버 액션 + 환경설정 정리

**What to build:** 편집·삭제(규칙 행), 복원(백업), 패널 펼침/접기가 텍스트 버튼 대신 lucide 아이콘 버튼이 되고, 모든 아이콘 버튼은 호버·포커스 시 Base UI Tooltip으로 이름을 보여준다(aria-label과 같은 카탈로그 키 공유). 행의 편집·삭제 아이콘은 행 호버·포커스 시에만 나타나 읽기 모드가 조용해진다. 환경설정에서는 단축키 안내문이 사라지고, 표준 자동완성 사전 전체가 제거 불가 pill로 보이며 사용자 항목만 X로 제거할 수 있다.

**Blocked by:** 02 — 칩·패널 프리미티브 (패널 헤더 아이콘화가 Collapsible 형태에 얹힘).

**Status:** done

- [x] 편집/삭제/복원/패널 펼침이 아이콘 버튼 — 호버·키보드 포커스 시 툴팁 표시 (smoke N17a, ko aria N14). **편차 명기:** 행 편집/삭제는 단일 키 공유, 복원·패널 펼침은 안정적 aria 이름(ariaRestoreBackup/toggleAriaLabel) + 문맥 툴팁(restore/show·hide)의 이중 키 — 상태 의존 이름 변경을 피하는 접근성 선택
- [x] 행의 편집/삭제 아이콘은 행 호버·focus-within 시에만 표시 — opacity만 조절해 탭 순서 유지, 키보드 도달 가능 (smoke N17a)
- [x] 환경설정: 단축키 안내문 없음, 표준 사전 18개 제거 불가 pill, 사용자 항목만 X 제거 (smoke N17b)
- [x] 전 게이트 green — tsc 0 · vitest 192 · build · smoke 69/69 ×3 · storybook · diag

## 리뷰 반영 (2축)

- 수정: 기본 사전과 중복되는 사용자 항목 추가를 core에서 차단(쌍둥이 pill·중복 key 방지, vitest 추가), IconButton 기본 톤 ghostInteractive 토큰 재사용, tooltipPopup 토큰 이동, Tooltip.Provider로 딜레이 그룹화(앱 루트), 셰브런 transition-transform, rc.0 Popup에 role="tooltip" 명시(WAI-ARIA), N14 ko 삭제 아이콘 aria 보강, 스토리 tooltip 오버라이드 케이스 추가.
- 기각: 사용자 pill의 X를 IconButton화 — pill 내부 마이크로 컨트롤은 셸 대상 아님. 백업 복원 아이콘 상시 표시 — 밀도 낮은 목록이라 의도적.
