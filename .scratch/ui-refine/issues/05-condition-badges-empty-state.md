# 05 — 조건 배지 줄 + 빈 상태 CTA

**What to build:** 규칙 행에서 Condition이 개수("조건: 1")가 아니라 값 배지 줄로 보인다 — 요약 아래 둘째 줄에 [POST] [main_frame] [~제외도메인] [⏰ 만료시각]처럼 차원이 구별되는 표기(제외는 부정 접두, 만료는 시계+시각)로 나열되고, 조건 없는 행은 배지 줄 없이 기존 높이를 유지한다. 규칙 0개 프로필 본문에는 안내 문구와 규칙 추가 유도가 보인다.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] 규칙 읽기 요약(ruleView)이 조건 배지 데이터(conditionBadges) 목록을 반환 — 6개 차원 구별 표기(POST/script/@init/tab:/~excl/⏰), 'Conditions: n' 문자열 대체 (vitest)
- [x] 조건 있는 행은 요약 아래 배지 줄 렌더, 없는 행은 배지 줄이 높이에 0 기여(내부 텍스트+패딩과 동일) (smoke N19a + diag 스크린샷)
- [x] 규칙 0개 프로필에 안내 + 규칙 추가 CTA — 클릭 시 규칙 폼 열림, 하단 버튼은 규칙 있을 때만 (smoke N19b)
- [x] 전 게이트 green — tsc 0 · vitest 199 · build · smoke 75/75 ×3 · storybook · diag

## 리뷰 반영 (2축)

- 수정: 만료 표기 단일 출처(expiry-format.ts) — 배지·폼 입력이 같은 local wall-clock에서 파생(중복·드리프트 위험 제거; 리뷰의 UTC 불일치 주장은 실측상 오판이나 중복은 실재), badgePill 토큰 추출(종류 배지·조건 배지 공유), stale 주석(dim/kind→tone/icon) 정정.
- **검증 강화(Spec AC2):** N19a가 'plain < cond'만이 아니라 '조건 없는 행 높이 = 내부 텍스트+패딩(배지 줄 0 기여)'을 단언 — 기존 높이 유지의 실질 불변식.
- 유지: tab: 접두는 resourceTypes(script)·methods(POST)와 같은 영문 기술 토큰 성격 — 카탈로그 불필요. 빈 상태/하단 Add rule 버튼은 상호배타(중복 아님).
