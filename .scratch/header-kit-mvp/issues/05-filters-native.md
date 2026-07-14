# 05 — Filter 1: 플랫폼 네이티브 조건

Status: ready-for-agent
Blocked by: 01

## Parent

`.scratch/header-kit-mvp/spec.md`

## What to build

DNR 조건으로 직접 매핑되는 Filter 다섯 종류와, regex·quota 안전망.

- URL Filter: regex, 복수 등록 시 OR 결합. 단일 regex 2KB 제한을 넘으면 규칙 분할로 대응.
- Exclude URL Filter: 자기 Profile 대역 상단의 allow 규칙으로 변환 (01에서 실기기 검증한 상호작용 위에 구현).
- Resource Type Filter: 타입 칩 다중 선택.
- Request Method Filter.
- Initiator Domain Filter (요청 출처 도메인 기준 — Tab Domain과 의미가 다름을 UI에 명시).
- regex는 저장 전에 플랫폼 API로 사전 검증하고, regex 규칙 타입별 1,000개·전체 quota 초과는 Compile이 항목 단위 경고로 반환한다 — 조용한 실패 금지.

## Acceptance criteria

- [ ] 각 Filter 종류가 적용 범위를 실제로 좁히는 것이 실브라우저에서 확인된다
- [ ] Filter 조합(AND)과 같은 종류 복수 등록(OR)의 의미가 골든 테스트로 검증된다
- [ ] Exclude가 같은 Profile의 Modification만이 아니라 하향 전파 의미론대로 동작함이 골든 테스트로 고정된다
- [ ] 2KB 초과 OR 결합이 규칙 분할로 처리되고, 분할 불가능한 한도 초과는 어느 항목이 왜 빠졌는지 경고로 노출된다
- [ ] 유효하지 않은 regex는 저장 시점에 거부된다
- [ ] Filter 편집 UI에 Storybook 스토리가 있다

## Blocked by

- 01-walking-skeleton.md
