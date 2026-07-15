# 03 — DS 씨앗: tokens + Button 이동 + Chip

Status: ready-for-agent
Blocked by: 01

## Parent

`.scratch/arch-restructure/spec.md` (설계 SSOT: `docs/reviews/arch-restructure/design.md` — cva 플랜 참조)

## What to build

디자인 시스템 레이어 `src/ui/`를 개설하고, 가장 중복이 심하고 위험이 낮은 프리미티브 **Chip**을 E2E로 증명한다. tokens를 먼저 깔아 이후 모든 프리미티브의 단일 출처를 만든다.

- `src/ui/tokens.ts` 신설 — 공유 클래스 조각:
  - `fieldSolid = 'border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900'`
  - `fieldFocus = 'outline-none focus:border-blue-500'`
  - `ghostInteractive = 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'`
  - `accentBg = 'bg-blue-600'`
- `git mv src/components/Button.tsx src/ui/Button.tsx` + `Button.stories.tsx` 신규 추가(없으면). Button의 primary/ghost 토큰 문자열을 tokens.ts 참조로 정리(동작 동일).
- `src/ui/Chip.tsx` 신설 — cva 컴포넌트:
  - `cva('cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors', { variants: { active: { true: 'bg-blue-600 text-white', false: 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400' } }, defaultVariants: { active: false } })`
  - `export function Chip({ active, ...props }: { active: boolean } & ButtonHTMLAttributes<HTMLButtonElement>)` — `<button type="button" aria-pressed={active} className={chip({ active })} {...props} />`. `aria-pressed` 덤으로 접근성 향상.
  - `Chip.stories.tsx` 추가.
- **삭제**: `src/components/HeaderRow.tsx`의 로컬 `chip()` 헬퍼(L22)와 `src/components/FilterRow.tsx`의 `chipClass()`(L113) — **바이트 동일**. 두 파일의 6개 호출부(HeaderRow: override/append/emptyMeans, FilterRow: resource-type/method 토글)를 `<Chip active={...} onClick={...}>`으로 교체.
- `src/components/Button` importer들(`@/components/Button`·`./Button`)을 `@/ui/Button`으로 갱신 — `grep`으로 전수.

주의: 이 슬라이스에서 HeaderRow/FilterRow는 아직 `src/components/`에 있다(features 이동은 07). Chip은 `@/ui/Chip`에서 import.

## Acceptance criteria

- [ ] `HeaderRow.chip`·`FilterRow.chipClass` 함수가 코드에서 사라짐(`grep -rn "chipClass\|function chip" src` 0건)
- [ ] Storybook에서 Chip active/inactive가 이전 칩과 픽셀 동일하게 렌더 + HeaderRow/FilterRow 스토리에서 토글 동작 동일
- [ ] `bun run check`·`bun run test`·`bun run build`·`bun run storybook:build` green, smoke green
- [ ] `src/ui/tokens.ts`가 accent/field/ghost 조각의 단일 출처이고 Button이 이를 참조
- [ ] i18n-coverage 테스트 여전히 green(문자열 카탈로그 불변)

## Blocked by

01 — src/ 루트. (02와 병렬 가능 — 서로 독립.)

## Comments
