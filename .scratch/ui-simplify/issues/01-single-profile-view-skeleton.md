# 01 — 단일 프로필 뷰 골격 + 칩 스위처 + 선택 재조정

**What to build:** 팝업을 열면 상단에 프로필 칩 행(각 칩에 on/off 도트, 끝에 `+ 새 프로필`)이 있고, 본문에는 선택된 프로필 하나만 보인다. 칩 클릭으로 전환하고, 새로 만들면 그 프로필이 선택된다. 프로필 목록이 어떤 식으로 변해도(삭제, import 전면 교체, 빈 목록) 선택은 "첫 활성 → 첫 프로필 → 빈 상태" 불변식으로 재조정된다. 칩 행은 줄바꿈+이름 truncate로 420px에서 절대 가로 오버플로하지 않는다. walking skeleton — 이후 모든 슬라이스가 이 구조 위에 선다.

**Blocked by:** None — can start immediately.

**Status:** done — commit 8d2b2f5

- [x] 팝업 본문에 선택 프로필 하나만 렌더되고, 칩 클릭으로 전환된다 (smoke N1)
- [x] 칩 도트가 각 프로필 on/off를 반영하고, `+` 생성 시 새 프로필이 선택된다 (smoke N1b/N2)
- [x] 선택 재조정이 순수 함수로 분리되고 삭제/전면 교체/빈 목록/활성 변경 전이를 단위 테스트로 검증한다 (vitest 7)
- [x] 선택 프로필 삭제 시 폴백 규칙대로 다음 선택, 빈 목록이면 빈 상태가 보인다 (smoke N3/N4)
- [x] 칩 행이 wrap+truncate로 420px 가로 오버플로 없음 (렌더 감사 — diag 시드 6프로필·긴 en/ko 이름)
- [x] 기존 smoke 전 항목이 새 조작 경로로 green (53/53), tsc·vitest168·build·storybook green

참고: 신규 aria-label은 앱 전반 관례(하드코딩 영어)를 따름 — 가시 라벨은 전부 카탈로그 경유. code-review 2축 리뷰 반영(cva 프리미티브 추출, focus ring, 빈 상태, 도트 상태 노출).
