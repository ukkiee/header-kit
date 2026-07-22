# 02 — 폼 내 URL 필터 입력 + 요약 스코프 표시

**What to build:** 규칙 폼에 URL 필터 입력창이 있어 규칙과 함께 저장되고, 규칙 행 요약이 `필터패턴 → 효과`로 스코프를 함께 보여준다(레퍼런스 결). 필터는 프로필 수준이므로 라벨에 명시하고, 폼은 프로필의 첫 URL 필터를 편집한다(비우면 제거). 고급 필터 9종은 필터 탭 유지.

**Blocked by:** None.

**Status:** done — commit 3114b1e

- [x] 폼에서 URL 필터 입력 → Save가 규칙+필터를 함께 저장 (smoke N15 — 스토리지 + 매칭 URL에만 헤더 적용)
- [x] 규칙 행 요약이 `스코프 → 효과` 형태로 표시 (ruleView scope 케이스, 렌더 감사 확인)
- [x] 스코프 비우고 Save → 프로필 URL 필터 제거 (N15)
- [x] 전 게이트 green (tsc0·vitest179·build·smoke68/68·storybook·diag exit 0)
