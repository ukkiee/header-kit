# 06 — 나머지 얇은 프리미티브 (Checkbox·ToggleSwitch·Pill·KindLabel·NoteText)

Status: done
Blocked by: 05

## Parent

`.scratch/arch-restructure/spec.md` (설계 SSOT: `docs/reviews/arch-restructure/design.md` — cva 플랜)

## What to build

남은 얇은 프리미티브를 만들어 카탈로그된 마지막 중복을 흡수한다. 이 슬라이스가 끝나면 feature 파일에서 카탈로그된 클래스 문자열이 전부 사라진다.

- `src/ui/Checkbox.tsx`: `cva('size-4 accent-blue-600', { variants: { offset: { none: '', row: 'mt-1.5' } }, defaultVariants: { offset: 'none' } })` — `<input type="checkbox" className={box({ offset })} {...rest}/>`. 채택 5곳: CspRow, FilterRow(offset row), HeaderRow, RedirectRow, TransferPanel(export select).
- `src/ui/ToggleSwitch.tsx`: Base UI `Switch` 래퍼(cva 아님) — `<ToggleSwitch checked onCheckedChange aria-label/>` → `<Switch.Root className='flex h-5 w-9 shrink-0 rounded-full bg-zinc-300 p-0.5 transition-colors data-[checked]:bg-blue-600 dark:bg-zinc-700'><Switch.Thumb className='size-4 rounded-full bg-white transition-transform data-[checked]:translate-x-4'/></Switch.Root>`. 채택: ProfileSection 활성 토글. accent를 Button/Chip/Checkbox와 통일.
- `src/ui/Pill.tsx`: `cva('rounded px-1.5 py-0.5 text-[10px]', { variants: { tone: { danger: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', neutral: 'flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800' } }, defaultVariants: { tone: 'neutral' } })`. 채택: BackupPanel corrupt 배지(danger), PreferencesPanel 제거가능 태그(neutral).
- `src/ui/KindLabel.tsx`: `<span>` over `cva('w-14 shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-400', { variants: { offset: { none: '', filter: 'mt-1' } }, defaultVariants: { offset: 'none' } })`. 채택 4곳: CspRow 'CSP', FilterRow KIND_LABELS, HeaderRow Cookie/Set-Cookie, RedirectRow 'Redirect'.
- `src/ui/NoteText.tsx`: `<p>/<span>` over `cva('text-[10px] text-zinc-400', { variants: { indent: { none: '', row: 'pl-6', inline: 'ml-1' } }, defaultVariants: { indent: 'none' } })`. 채택 7곳: FilterRow 힌트×3, HeaderRow emptyArrow(inline)+response/placeholder note(row), RedirectRow capture note(row).
- 각 프리미티브 `.stories.tsx` 추가.

## Acceptance criteria

- [ ] `grep`으로 카탈로그된 클래스 문자열(size-4 accent, uppercase tracking-wide, text-[10px] text-zinc-400 등)이 feature 파일에서 사라짐
- [ ] ProfileSection 스위치·전 체크박스·배지·라벨·노트가 이전과 시각 동일(Storybook)
- [ ] `bun run check`·`test`·`build`·`storybook:build`·`smoke` green
- [ ] i18n-coverage green

## Blocked by

05 — 같은 feature 파일 순차 수정.

## Comments

**2026-07-15 완료** (commit `a33f191`, 리뷰 반영 `aa263f2`). Checkbox·ToggleSwitch·Pill·KindLabel·NoteText 신설, 카탈로그된 인라인 문자열 전부 흡수(잔여 0). KindLabel 인라인화로 노출된 RedirectRow 'Redirect' 하드코딩 갭을 기존 키 t('modRedirect')로 수정(카탈로그 무변경). 코드리뷰: Pill text-[10px]을 danger 톤으로(neutral 태그 가독성), tokens accentBg 문서 정정.
