# 08 — (이연·behavior-adjacent) FilterRow 내부 분해 + i18n 수리

Status: ready-for-agent
Blocked by: 07

## Parent

`.scratch/arch-restructure/spec.md` (설계 SSOT: `docs/reviews/arch-restructure/design.md` — 비목표/슬라이스 8)

## ⚠️ 성격

**behavior-adjacent — 별도 리뷰 필수.** 이 슬라이스는 컴포넌트 경계를 바꾸고 사용자 가시 문자열(en/ko 카탈로그)을 추가하므로, 순수 구조 패스(01~07)와 분리해 독립적으로 리뷰·롤백한다. 01~07이 머지·안정화된 뒤 착수 권장.

## What to build

- FilterRow 내부 추출:
  - `DraftInput`(범용 입력 헬퍼) → `src/ui/`로 (Input recipe 위에).
  - `PickerSelect` + 10종 `FilterEditor` switch → `src/features/filters/`로 분리(FilterRow는 조합만 남김).
- i18n 수리: FilterRow의 하드코딩 영어를 `useT`로 라우팅. `src/core/i18n.ts`의 `MESSAGES`에 en/ko MessageKey 추가(키 완전성 테스트가 강제).
- i18n-coverage가 이제 FilterRow도 커버하는지 확인(07에서 재귀화됨).

## Acceptance criteria

- [ ] FilterRow가 DraftInput/PickerSelect/FilterEditor로 분해되고 각 책임이 ui/ 또는 features/filters/에 위치
- [ ] FilterRow의 하드코딩 영어가 사라지고 en/ko 카탈로그로 이동, `bun run test`의 i18n 키 완전성·커버리지 테스트 green
- [ ] 필터 편집 동작이 이전과 동일(스토리·smoke로 확인)
- [ ] `bun run check`·`test`·`build`·`storybook:build`·`smoke` green
- [ ] **별도 리뷰 게이트 통과**(behavior-adjacent이므로 review-gate 또는 code-review 권장)

## Blocked by

07 — FilterRow가 `src/features/filters/`로 이동한 뒤.

## Comments
