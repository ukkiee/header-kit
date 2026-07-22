# 01 — 폼 프리미티브 Base UI 교체 (Select·Input·Checkbox·Field)

**What to build:** 종류·모드·빈 값·URL 매치 방식 등 모든 셀렉트가 OS 네이티브 팝업 대신 앱 스타일(라이트/다크)의 Base UI Select로 동작한다. 입력·체크박스·필드 셸도 Base UI 프리미티브 기반으로 교체되어, 이후 슬라이스(검증·툴팁·토스트)가 얹힐 단일 컴포넌트 계층이 선다 (ADR 0011). 사용자 흐름(규칙 추가·편집·저장)은 그대로다.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 폼의 모든 셀렉트(종류/모드/빈 값/매치 방식 등)가 Base UI Select로 동작하고 팝업이 앱 스타일로 렌더 — 선택 결과가 기존과 동일하게 저장 (smoke)
- [ ] 입력·체크박스·필드 셸이 Base UI 프리미티브 기반 — 기존 추가/편집/저장 흐름 회귀 없음 (smoke 전체 green)
- [ ] 접근성 이름이 en/ko 카탈로그 경유로 유지 (ko 접근성 스모크 green)
- [ ] 전 게이트 green (tsc·vitest·build·smoke·storybook·diag)
