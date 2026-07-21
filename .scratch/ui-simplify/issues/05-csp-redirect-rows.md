# 05 — CSP·리다이렉트 테이블 행 통합

**What to build:** CSP와 리다이렉트 수정도 같은 테이블 행 언어로 보인다 — 1줄 요약(종류 뱃지 + 핵심 내용) + 선택 시 전용 편집 UI(CSP 디렉티브 목록, 리다이렉트 패턴/치환) 확장. 목록의 시각 언어가 수정 종류와 무관하게 일관된다.

**Blocked by:** 04 — 테이블형 행.

**Status:** done — commit 584873e

- [x] CSP·리다이렉트 행이 테이블 1줄 요약으로 보이고 선택 시 전용 편집이 확장된다 (렌더 감사 — 5종 행 시각 언어 통일)
- [x] 새 UI 경로로 CSP 디렉티브 편집 → 실제 응답 헤더 반영 (smoke M3b 신규, M3 green 유지)
- [x] 새 UI 경로로 리다이렉트 패턴 편집 → 실제 리다이렉트 반영 (smoke M4b — 치환+패턴 모두 UI 편집, M4/M5 green 유지)
- [x] 리다이렉트 캡처 그룹 힌트 등 기존 노트가 확장 영역에 유지된다
- [x] 전 게이트 green (tsc0·vitest170·build·smoke58/58·storybook)

참고: code-review 2축 반영 — ModRowShell 추출(3행 중복 해소)·RowExpansionProps·modSummary 공유, 요약 클릭 확장(데드존 제거), M4b 패턴 편집 보강, pollUntil 범용 폴러(기존 폴러 5종 전환은 09 잔여로 이연).
