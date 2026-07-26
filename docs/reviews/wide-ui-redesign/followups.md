# wide-ui-redesign — follow-ups

`/feature-loop`가 티켓·게이트 리뷰에서 **defer**로 판정한 항목. 각 항목의 판정 근거는
`docs/reviews/wide-ui-redesign/decisions.md`의 같은 ID 행에 있다.

## T06-R-4 — 적용-실패 판정의 중복 (badge.ts ↔ status-summary.tsx)
"applyError면 걸린 게 아니다"라는 같은 판단을 `src/core/badge.ts:29`와
`src/features/.../status-summary.tsx:24`가 각자 표현한다. 파생값(예: `appliedRuleCount`)을
`src/core/summary.ts`로 올리면 툴바와 패널이 한 답을 공유한다. — Fowler: Duplicated Code + Feature Envy.

## T06-R-5 — `HIDDEN` 이름이 색을 배신한다
`src/core/badge.ts:15`의 `const HIDDEN: BadgeSpec = { text: '', color: PAUSED_COLOR }` —
"숨김"이 일시정지 회색을 나른다. 세 사용처 중 둘에서 이름과 값이 어긋난다. — Fowler: Mysterious Name.

## T06-R-6 — `Profile.shortLabel`이 죽은 필드가 됐다
티켓 06이 툴바 배지를 프로필 표시기에서 카운터로 바꾸면서 `shortLabel`의 유일한 렌더
소비자가 사라졌다. 그런데 `profile-section.tsx:85`의 편집 입력과 `commands.ts:268`의 2자
불변식은 남아 있어, 사용자가 고쳐도 아무 데도 보이지 않는다. 퇴역시키거나 새 용처를 준다.
티켓 10(셸 구조 재작업)이 자연스러운 자리다.

## T06-R-7 — 스모크 N-시리즈 번호 순서
`scripts/smoke.mjs:2344`에서 N37이 N36 앞에 삽입돼 파일 내 번호 순서가 어긋난다. 동작에는
영향이 없다.

## T06-R-8 — `badgeCountNote` 보조 문구
설정의 배지 토글 아래 보조 설명은 티켓 06 스펙에 없는 추가다. "표시 여부만 제어"를
오해하지 않게 하는 최소 문구라 남기되, 문구 자체는 카피 리뷰 대상이다.
