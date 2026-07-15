# 05 — Alert + Card + CollapsiblePanel

Status: ready-for-agent
Blocked by: 04

## Parent

`.scratch/arch-restructure/spec.md` (설계 SSOT: `docs/reviews/arch-restructure/design.md` — cva 플랜)

## What to build

구조를 흡수하는 프리미티브 3종. 특히 CollapsiblePanel은 클래스뿐 아니라 section+header+show/hide **구조**까지 흡수하는 최대 레버리지 컴포넌트다.

- `src/ui/Alert.tsx` (component over cva):
  - `cva('rounded-md px-2 py-1', { variants: { severity: { info: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300', warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300', danger: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' }, size: { xs: 'text-[11px]', sm: 'text-xs' } }, defaultVariants: { severity: 'info', size: 'sm' } })`
  - polymorphic `as`(p/ul), `role='alert'` 전달, children.
  - 채택 8곳: App(incognito=info, paused=warn, commandError=danger), StatusSummary(applyError=danger, warning li=warn), TransferPanel(notices=info, errors=danger), BackupPanel(restore error=danger). **StatusSummary의 `bg-red-100`/`rounded` 드리프트를 표준 `bg-*-50`/`rounded-md`로 정규화**(의도).
- `src/ui/Card.tsx` (recipe):
  - `cva('flex flex-col', { variants: { variant: { outlined: 'gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800', filled: 'gap-1.5 rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-900', row: 'gap-1 rounded-md border border-transparent px-1 py-1 hover:border-zinc-200 dark:hover:border-zinc-800' } }, defaultVariants: { variant: 'outlined' } })`
  - 채택: ProfileSection 카드(outlined), StatusSummary 카드(filled), CspRow/HeaderRow/RedirectRow row 컨테이너(row). **주의**: `max-w-3xl` 셸 마커는 팝업 min-width CSS(`:has()`)가 의존하므로 Card로 흡수하지 말고 별도 유지.
- `src/ui/CollapsiblePanel.tsx` (실제 컴포넌트, recipe 아님):
  - props `{ title: ReactNode; actions?: ReactNode; open: boolean; onOpenChange: (o: boolean) => void; children }`. controlled open — 패널은 자기 도메인 body 상태를 계속 소유.
  - 렌더: `<section className='flex flex-col gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800'><header className='flex items-center gap-1'><span className='text-xs font-medium text-zinc-400'>{title}</span><div className='flex-1'/>{actions}</header>{open && children}</section>`
  - 채택: BackupPanel·PreferencesPanel·TransferPanel의 section+header+show/hide 스캐폴드(9곳) 대체.
- 각 프리미티브 `.stories.tsx` 추가.

## Acceptance criteria

- [ ] App/StatusSummary/Transfer/Backup의 인라인 severity 배너 문자열이 사라지고 `<Alert severity=...>`로 대체
- [ ] StatusSummary 배너 드리프트가 표준값으로 정규화됨(Storybook 확인)
- [ ] 3개 패널이 CollapsiblePanel 사용, expand/collapse 동작 동일(스토리에서 확인)
- [ ] `max-w-3xl` 셸 마커 유지 → 팝업 min-width 동작 불변(smoke)
- [ ] `bun run check`·`test`·`build`·`storybook:build`·`smoke` green

## Blocked by

04 — Input/Select 채택 이후(같은 feature 파일을 순차 수정해 충돌 회피).

## Comments
