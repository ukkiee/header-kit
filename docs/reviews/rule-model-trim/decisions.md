# rule-model-trim gate decisions

### plan r1

- R-1 accept (+ 로드 경로까지 확장) — Open question: CSP filtering must precede import validation. 리뷰어는 import(user story 9)만 짚었으나, 코드 확인 결과 로드 경로(`parseStoredState`)도 같은 순서 문제이며 더 심각하다(csp가 `isProfile`을 거부 → `createDefaultState()`로 **전체 상태 리셋**, user story 8). 그래서 스펙에 (1) csp 제거를 **검증 게이트보다 먼저** 두는 것을 양 진입점(로드 backfill 전 / import validateProfileEntry 전)에 명문화, (2) 테스트를 내부 헬퍼가 아닌 `parseStoredState`·`parseImport` **진입점 관통**으로 강제하도록 반영했다.

### plan r2

- 발견 0건 — verdict **approve**. R-1이 양 경로(로드·import)에서 resolved로 재검증됐다: 검증 전 필터 순서가 명확하고, `parseStoredState`·`parseImport` 진입점 관통 테스트가 강제됐다(리셋/거부 없음·나머지 보존·import notice 없음). 스펙 수정이 새로 들인 critical·high 없음. **플랜 게이트 통과 — 다음은 /to-tickets.**

### structure r1

- 발견 0건 — verdict **approve**, 트리아지할 행 없음. 브랜치 diff(main…35db355, 31파일) 기준으로 "슬라이스가 플랜과 일치한다": 퇴역 CSP 데이터가 저장·import 두 시임 모두에서 **검증 전에** 걸러지고, `parseStoredState`·`parseImport`를 진입점으로 고정한 테스트가 그 행동을 못박으며, 남은 Initiator 라벨 증분(티켓 02)이 스키마·매칭 로직과 분리돼 있다. 거시 구조 지적 없음. **structure 게이트 통과 — 티켓 02 진행 가능.**
- 게이트 환경 주의: Codex 샌드박스가 읽기 전용이라 Vite의 임시 설정 파일 쓰기가 막혀 **Vitest는 게이트 안에서 기동하지 못했다**(tsc는 통과). 테스트 증거는 게이트가 아니라 로컬 실행이 진다 — 티켓 01 커밋 시점 vitest 200/200·smoke 104/104·ui-diag PASS. 릴리스 게이트 전 `verification.md`가 이 증거를 커밋으로 고정해야 한다.

### release r1

- 발견 0건 — verdict **approve**, 트리아지할 행 없음. 브랜치 diff(main…83f8621, 34파일) 기준으로 "최종 diff가 스펙과 일치한다": 퇴역 CSP 규칙이 로드·import 양 경로에서 **검증 전에** 걸러지고, 무관한 데이터와 `csp_report`가 보존되며, CSP가 모델·컴파일러·검증·UI·요약·라벨·i18n 전반에서 제거됐다. **커밋된 검증 증거가 요구된 진입점 마이그레이션과 UI 시임을 덮는다**고 명시적으로 확인됐다 — structure r1에서 Vitest가 기동하지 못해 생긴 공백을 `verification.md`가 메웠다는 뜻이다. 릴리스 차단 사유 없음.
- **세 게이트 전부 클린**: plan r2 approve(0건) · structure r1 approve(0건) · release r1 approve(0건). 인간 waiver 없이 통과했다.
