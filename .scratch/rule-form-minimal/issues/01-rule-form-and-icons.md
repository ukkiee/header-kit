# 01 — 규칙 요약/폼 편집 + lucide 아이콘 미니멀화

**What to build:** 수정 목록이 읽기 요약 행(체크박스+이름+종류 배지+효과 한 줄+Edit/Delete)이 되고, `Add rule` 버튼 하나로 폼이 열려 종류 선택→필드 입력→Save로 규칙이 원자 저장된다. 전 아이콘을 lucide(strokeWidth 1.75)로 교체. 근거: ADR 0006.

**Blocked by:** None — can start immediately.

**Status:** done — commit e3cf772

- [x] 규칙이 요약 행으로 보이고 Edit 폼에서 종류별 필드로 편집·저장된다 (smoke N7/N7b 헤더, M3b CSP, M4b 리다이렉트, J3 대형 편집기)
- [x] Add rule → 종류 선택 → Save가 실제 요청에 반영된다 (smoke N10 — `x-from-tab: yes` 실요청)
- [x] ruleView 순수 함수 단위 테스트 전 종류 (vitest 7 — 배지/제목 폴백/append·빈 값 지역화)
- [x] 유니코드 글리프 0(스토리 포함), lucide 단일 패밀리 strokeWidth 1.75 (grep 감사)
- [x] 전 게이트 green (tsc0·vitest178·build·smoke67/67·storybook·diag exit 0)

참고: code-review 2축 반영 — ADR 0004 대체 각주(테이블 행→0006), 카탈로그 우회 2건(emptyMarker/saveRejected), 사장 키 4개 제거, kindLabel 맵화, 스토리 글리프. 의도적 결정: 요약의 URL 스코프 생략(필터는 프로필 수준 — 행마다 반복은 반미니멀), 규칙 삭제 무확인 유지(기존과 동일, 프로필 삭제만 확인), materialized 값 UI 표시 제거(동작은 smoke G가 네트워크 수준 검증). 잔여 판단 노트: RuleForm 캐스트 밀도·종류 분기(7번째 종류 추가 시 종류별 필드 서브컴포넌트로 추출)."
