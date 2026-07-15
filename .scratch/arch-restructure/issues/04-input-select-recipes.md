# 04 — Input + Select recipe 채택

Status: done
Blocked by: 03

## Parent

`.scratch/arch-restructure/spec.md` (설계 SSOT: `docs/reviews/arch-restructure/design.md` — cva 플랜)

## What to build

가장 큰 중복(field 문자열 16곳)을 흡수하는 **Input** recipe와 **Select** recipe를 만들어 전 호출부에 적용한다. recipe는 호출자가 element/ref/레이아웃 클래스를 유지하도록 className을 **append-only**로 받는다(override 아님 → tailwind-merge 불필요).

- `src/ui/Input.tsx`:
  - `cva(['rounded-md', fieldFocus], { variants: { variant: { solid: fieldSolid, ghost: 'border border-transparent bg-transparent focus:border-zinc-300 dark:focus:border-zinc-700' }, size: { xs: 'h-6 px-1 text-[11px]', sm: 'h-7 px-2 text-xs', md: 'h-8 px-2 text-sm' }, font: { sans: '', mono: 'font-mono' }, align: { start: '', center: 'text-center' } }, defaultVariants: { variant: 'solid', size: 'md', font: 'sans', align: 'start' } })`
  - `forwardRef`, `Input`/`TextArea` 겸용(또는 별도 `TextArea`), 호출자 className을 **뒤에 append**.
- `src/ui/Select.tsx`:
  - `cva('cursor-pointer rounded-md outline-none', { variants: { variant: { bordered: [fieldSolid, 'px-1 focus:border-blue-500'], ghost: ['bg-transparent px-1', ghostInteractive] }, size: { sm: 'h-7 text-xs', md: 'h-8 text-xs' } }, defaultVariants: { variant: 'bordered', size: 'sm' } })`
  - `children`은 `<option>`들.
- 채택 (호출부 → variant):
  - Input.solid: CspRow×2, FilterRow×4, HeaderRow×2(**HeaderNameInput 내부에서 Input 소비** — 호출자가 field 문자열 손넘김 중단), RedirectRow×2, PreferencesPanel, ProfileSection×2, LargeEditor textarea, TransferPanel textarea.
  - Select.bordered: FilterRow PickerSelect, HeaderRow header-target. Select.ghost: ProfileSection add-modification·add-filter 메뉴.
- **의도된 정규화(공짜)**: RedirectRow `text-xs`→md(`text-sm`), PreferencesPanel L53 누락 text-size 보정 — cva default가 통일. 이 diff는 예상된 것.
- 각 프리미티브 `.stories.tsx` 추가.

## Acceptance criteria

- [ ] 카탈로그된 field/select 인라인 문자열이 호출부에서 사라짐(`grep -rn "border-zinc-300 bg-white" src/components` 0건)
- [ ] HeaderNameInput이 field 문자열을 prop으로 받지 않고 내부에서 Input 소비
- [ ] Storybook 시각 확인: RedirectRow/PreferencesPanel 정규화 diff만 의도대로 보이고 그 외 변화 없음
- [ ] `bun run check`·`test`·`build`·`storybook:build`·`smoke` green
- [ ] 레이아웃 유틸(`flex-1`,`w-32` 등)은 여전히 호출부 className으로 append됨(프리미티브화 안 함)

## Blocked by

03 — tokens.ts + ui/ 레이어 필요.

## Comments

**2026-07-15 완료** (commit `1f83302`, 리뷰 반영 `aa263f2`). ui/Input(+TextArea)·Select 신설, 16 필드+4 select+2 textarea를 9컴포넌트 채택, HeaderNameInput 내부 Input 소비. fieldSolid/fieldFocus 토큰 소비. 검증 tsc0/test151/build/smoke48/storybook. 코드리뷰: Select ghost 포커스 outline 유지·bordered fieldFocus 재사용으로 수정.
