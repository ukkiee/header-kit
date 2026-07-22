# 05 — 조건 배지 줄 + 빈 상태 CTA

**What to build:** 규칙 행에서 Condition이 개수("조건: 1")가 아니라 값 배지 줄로 보인다 — 요약 아래 둘째 줄에 [POST] [main_frame] [~제외도메인] [⏰ 만료시각]처럼 차원이 구별되는 표기(제외는 부정 접두, 만료는 시계+시각)로 나열되고, 조건 없는 행은 배지 줄 없이 기존 높이를 유지한다. 규칙 0개 프로필 본문에는 안내 문구와 규칙 추가 유도가 보인다.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 규칙 읽기 요약이 조건 배지 데이터 목록을 반환 — 차원 구별 표기, 'Conditions: n' 문자열 대체 (vitest)
- [ ] 조건 있는 행은 요약 아래 배지 줄 렌더, 없는 행은 높이 불변 (smoke + diag 스크린샷)
- [ ] 규칙 0개 프로필에 안내 + 규칙 추가 CTA — 클릭 시 규칙 폼 열림 (smoke)
- [ ] 전 게이트 green
