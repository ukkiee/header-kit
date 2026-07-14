# 05 — Filter 1: 플랫폼 네이티브 조건

Status: done
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

## Comments

**2026-07-15 구현 완료.** 테스트 53/53, 실브라우저 스모크 18/18 (E1 URL, E2 Exclude 하향 전파, E3 Method, E5 Resource Type, E6 Initiator Domain, E4 invalid regex 권위 경로 거부).

2축 코드리뷰 반영:
- 패턴 입력을 blur/Enter 커밋 초안 방식으로 변경 — 키 입력마다 저장 검증에 걸려 `(api)` 같은 패턴이 입력 불가능해지는 버그 수정.
- quota 경고를 항목 단위로 세분(같은 항목의 분할 변형만 접음), Request Method에 connect/other 추가, CONTEXT.md Filter 종류에 Request Method 추가, 컴파일 중간 표현 이름을 glossary에 맞게 CompiledFilters로 변경.

결정 기록:
- **Exclude의 URL 단위 의미론 유지 (기각)**: 리뷰가 "Exclude allow가 profile의 다른 필터(AND)를 무시해 제외가 더 넓다"고 지적 — 이는 PRD가 정의한 의도된 의미론(Exclude는 URL 패턴 기준, 하향 전파)이라 변경하지 않고 코드 주석·본 코멘트로 문서화.
- **OR-join의 apply 시점 실패 노출 (이연 → 이슈 10)**: 소스 길이 휴리스틱(1500자)이 컴파일 2KB 제한을 보수적으로 근사하지만, join이 apply에서 거부되는 드문 경우는 현재 console.error에만 남는다. 사용자 가시화는 이슈 10의 경고 요약 뷰에서 apply 실패 채널과 함께 처리.
