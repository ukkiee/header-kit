# 08 — Import / Export

Status: ready-for-agent
Blocked by: 04, 06, 07

## Parent

`.scratch/header-kit-mvp/spec.md`

## What to build

자체 스키마 v1 단일 형식의 JSON Import/Export (ADR-0003).

- Export: Profile 다중 선택, 템플릿만 포함(실체화 상태 제외), 파일 다운로드.
- Import: 파일 선택과 붙여넣기 모두 지원. 전체 검증 후 전량 수용 또는 전량 거부 — 부분 수용 없음. 거부 시 항목 단위의 명확한 오류 메시지.
- 활성화 경계: 활성 플래그가 켜진 Profile을 Import 하면 비활성→활성 전환과 동일하게 모든 enabled Placeholder를 원자적으로 실체화한 뒤에야 규칙이 적용된다.
- Import 당시 존재하지 않는 탭·그룹·창을 가리키는 Tab 계열 Filter 값의 처리(무효 조건은 정리하고 알림)를 정의한다.

## Acceptance criteria

- [ ] Export→Import 라운드트립이 의미를 보존한다 (불변성 테스트)
- [ ] 깨진 JSON·스키마 위반이 전량 거부되고 어느 항목이 왜 틀렸는지 표시된다
- [ ] 활성 상태로 Export된 Placeholder 포함 Profile을 Import 하면 새로 실체화된 값으로 즉시 동작한다 (활성화 경계 테스트)
- [ ] Export에 실체화 값이 포함되지 않음이 테스트로 고정된다
- [ ] 존재하지 않는 탭 참조 Filter가 Import에서 안전하게 처리된다

## Blocked by

- 04-profile-lifecycle.md
- 06-filters-tab-time.md (Tab 계열 Filter 스키마가 있어야 무효 탭 참조 처리를 구현·검증 가능)
- 07-placeholder.md
