# 01 — nowrap 프리미티브 하드닝

Status: done — 20dad48 (랜딩 완료, 상태 후기입)
Blocked by: None - can start immediately

## Parent

`.scratch/popup-ui-fixes/spec.md` (PRD: `docs/prds/popup-ui-fixes.md`)

## What to build

프리미티브가 좁은 공간에서 텍스트를 세로로 붕괴시키지 않도록 기본 클래스에 `whitespace-nowrap`을 넣는다. 라벨 버튼은 콘텐츠 폭 아래로 압축되지 않도록 `shrink-0`도.

- `src/ui/button.tsx`: cva 기본에 `whitespace-nowrap shrink-0` 추가.
- `src/ui/chip.tsx`: 기본에 `whitespace-nowrap`.
- `src/ui/select.tsx`: 기본에 `whitespace-nowrap`.
- `src/ui/kind-label.tsx`: 기본에 `whitespace-nowrap`(이미 w-14 고정폭이지만 방어).
- Input/TextArea는 텍스트 필드라 nowrap 대상 아님(값 스크롤).

## Acceptance criteria

- [ ] Button/Chip/Select/KindLabel cva 기본에 `whitespace-nowrap` 포함(grep)
- [ ] `bun run check`·`test`·`build`·`storybook:build` green
- [ ] `bun run build && node scripts/ui-diag.mjs` — 렌더에서 액션 행 버튼이 더 이상 세로 한 글자씩 붕괴하지 않음(가로 오버플로/접힘은 02에서 해결)

## Blocked by

None. 02의 기반.

## Comments
