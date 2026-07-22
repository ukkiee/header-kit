# 03 — 규칙 단위 URL 필터 (프로필 전체 적용 대체)

**What to build:** 폼의 URL 필터가 프로필이 아니라 **그 규칙에만** 적용된다. 스키마에 `urlFilter?: string`(redirect 제외 5종), 컴파일은 자체 필터가 있으면 그 규칙의 regexFilter로 프로필 URL 조인을 대체(나머지 프로필 필터 차원은 상속), 한도 초과 시 방출 금지+경고, 저장 시점 regex 검증(import 포함). 근거: ADR 0007.

**Blocked by:** None. (02의 프로필 스코프 동작을 대체)

**Status:** done — 아래 참조

- [x] 컴파일: 자체 필터가 프로필 조인 대체·CSP 포함·한도 초과 방출 금지·공백 무시 (compile 테스트 4)
- [x] 스키마·persist: 선택 문자열 검증, redirect 거부, 왕복 보존 (schema 테스트)
- [x] 저장 시점 regex 검증 — add/update-modification·import (background validateCommand)
- [x] UI: 폼 입력이 규칙 필드 편집(redirect 숨김), 요약 프리픽스 = 자기 필터 (ruleView 테스트)
- [x] smoke N15: 같은 프로필에서 스코프 규칙은 매칭 URL만·무스코프는 전역·프로필 필터 0 유지·비우면 해제 — 실요청 검증
- [x] 전 게이트 green (tsc0·vitest184·build·smoke68/68·storybook·diag exit 0)
