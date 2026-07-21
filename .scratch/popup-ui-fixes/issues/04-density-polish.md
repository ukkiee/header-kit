# 04 — 밀도 폴리시

Status: done — 94beaf5 (랜딩 완료, 상태 후기입)
Blocked by: 02

## Parent

`.scratch/popup-ui-fixes/spec.md`

## What to build

렌더 감사에서 대부분 OK였으나, flex 자식 입력이 콘텐츠 폭 아래로 못 줄어드는 잠재 오버플로를 방어하고 최종 확인.

- `flex-1` 값 입력(HeaderRow value, RedirectRow pattern/substitution 등)에 `min-w-0` 추가해 긴 값에서 행 오버플로 예방(축소는 텍스트 스크롤로 처리).
- `ui-diag.mjs`를 긴 값(매우 긴 헤더 값·regex)으로 한 번 더 렌더해 행 오버플로 없음 최종 확인.
- 감사에서 이미 OK인 요소는 리터치 금지(범위 이탈 방지).

## Acceptance criteria

- [ ] 긴 값 렌더에서 어떤 행도 팝업 폭을 넘겨 가로 스크롤/클리핑을 만들지 않음 — 스크린샷 증거
- [ ] `bun run check`·`test`·`build`·`smoke`·`storybook:build` green
- [ ] diff가 min-w-0 등 방어적 유틸에 국한(OK 판정 요소 무변경)

## Blocked by

02 (액션 행 이후 최종 밀도 확인).

## Comments
