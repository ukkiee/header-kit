# 04 — 탭 제거 + 규칙·조건 단일 목록 (ADR 0009) & URL 매치 방식 (ADR 0008)

**What to build:** 수정/필터 탭을 없애고 규칙 행들 아래 `적용 조건 (프로필 전체)` 캡션 + FILTER 배지 행으로 통합. `Add rule` 폼의 종류 셀렉트가 optgroup(규칙/적용 조건)으로 조건 10종을 포함하고, 조건 필드는 FilterEditor 재사용, Save가 add/update-filter 원자 전송. + 규칙 URL 필터에 매치 방식(도메인/포함/시작/정규식) — 비정규식은 DNR urlFilter로 컴파일되어 regex 한도 미소모.

**Blocked by:** None.

**Status:** done — 아래 참조

- [x] 매치 방식 4종 컴파일 매핑 + regex 한도 미소모 + 하위 호환(부재=regex) (compile 테스트 3, ADR 0008)
- [x] 통합 목록: 규칙+캡션+FILTER 행, 탭 0 (smoke N5, 렌더 감사)
- [x] 통합 폼: optgroup 종류 선택 → 조건 추가·편집·삭제 원자 반영 (smoke N6)
- [x] filterView 순수 함수 (vitest 5 — 종류별 요약·빈 값 폴백)
- [x] contains·regex 실요청 스코핑 (smoke N15)
- [x] 퇴역: ui/tabs·filter-row·draft-input(+사장 i18n 키 12) — 폼 로컬 초안에서 blur-커밋 입력의 존재 이유 소멸
- [x] 전 게이트 green (tsc0·vitest192·build·smoke68/68×3·storybook·diag exit 0)

참고: Save→Edit 연쇄의 폼 닫힘 경합을 waitFormClosed 공용 대기로 봉합. 조건 행 체크박스 aria는 Enable filter로 정직화.
