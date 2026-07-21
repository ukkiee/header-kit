# 03 — 언더라인 탭 (수정/필터) + 개수 뱃지

**What to build:** 선택된 프로필 내부가 수정/필터 언더라인 탭으로 나뉜다. 탭에는 항목 개수가 표시되고, 한 화면에는 한 관심사만 보인다. 필터 관련 조작은 전부 필터 탭 안으로 이동한다.

**Blocked by:** 02 — 시스템 테마 (신규 프리미티브를 양 테마로 만들기 위해).

**Status:** done — commit 088560c

- [x] 수정/필터 탭 전환이 동작하고 개수 뱃지가 실제 항목 수와 일치한다 (smoke N5)
- [x] 필터 추가·편집·삭제 smoke 시나리오가 탭 경유 경로로 green (smoke N6 — 기존 UI 경유 필터 조작이 없어 신규 추가)
- [x] 탭 라벨이 en/ko 카탈로그를 경유한다 (tabModifications/tabFilters, tsc parity)
- [x] 탭이 키보드로 포커스·활성화된다 (N5: 화살표 이동 + Enter 활성화)
- [x] 양 테마 스토리 존재(UI/Tabs × 테마 툴바), 전 게이트 green (tsc0·vitest170·build·smoke55/55·storybook)

참고: code-review 2축 반영 — 탭 press scale 추가, 활성 탭 상태 앱 레이어 리프트(스펙 결정 준수), 흔적 래퍼 제거, ZeroCounts 스토리 양 패널.
