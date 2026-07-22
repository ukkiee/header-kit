# 01 — 규칙 요약/폼 편집 + lucide 아이콘 미니멀화

**What to build:** 수정 목록이 읽기 요약 행(체크박스+이름+종류 배지+효과 한 줄+Edit/Delete)이 되고, `Add rule` 버튼 하나로 폼이 열려 종류 선택→필드 입력→Save로 규칙이 원자 저장된다. 전 아이콘을 lucide(strokeWidth 1.75)로 교체. 근거: ADR 0006.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 규칙이 요약 행으로 보이고 Edit 폼에서 종류별 필드로 편집·저장된다 (smoke — 헤더/CSP/리다이렉트 각 1 경로)
- [ ] Add rule → 종류 선택 → Save가 실제 요청에 반영된다 (smoke)
- [ ] ruleSummary 순수 함수 단위 테스트 (전 종류)
- [ ] 유니코드 글리프 0, lucide 단일 패밀리 (grep 감사)
- [ ] 전 게이트 green (tsc·vitest·build·smoke·storybook·diag)
