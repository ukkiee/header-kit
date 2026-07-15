# 07 — feature 폴더 재편 + App/css hoist + i18n 재귀화

Status: done
Blocked by: 02, 06

## Parent

`.scratch/arch-restructure/spec.md` (설계 SSOT: `docs/reviews/arch-restructure/design.md`)

## What to build

DS 채택이 끝난 뒤 도메인 레이어를 feature 폴더로 재편하고, 공유 셸을 entrypoints 밖으로 hoist하며, i18n 커버리지 가드를 재귀 스캔으로 고친다. 동작 변경 없음(순수 이동 + import 갱신 + 테스트 스캔 로직 수정).

- `src/components/`를 feature 폴더로 `git mv`:
  - `profiles/`: ProfileSection(+stories)
  - `modifications/`: HeaderRow, HeaderNameInput, CspRow, RedirectRow(+stories)
  - `filters/`: FilterRow(+stories) — **이번엔 통째 이동**(내부 분해는 08)
  - `status/`: StatusSummary(+stories)
  - `transfer/` `backup/` `preferences/`: 각 패널(+stories)
- `src/ui/`로 이동: `i18n-context.tsx`(LocaleProvider/useT — features보다 아래여야 함), `LargeEditor.tsx`(+stories), `i18n-coverage.test.ts`.
- 공유 셸 hoist:
  - `git mv src/entrypoints/popup/App.tsx src/app/App.tsx`
  - `git mv src/entrypoints/popup/style.css src/app/styles/global.css` (`@import 'tailwindcss'` + 팝업 min-width `:has()` 규칙 유지)
  - `git mv src/components/AppLayout.stories.tsx src/app/TabLayout.stories.tsx` (고아 스토리 — meta.title은 이미 `App/TabLayout`; ProfileSection/StatusSummary import를 `@/features/*`로 재타겟)
- import 갱신 (grep 전수):
  - App.tsx의 `@/components/*` 7곳 → `@/ui/*` + `@/features/*`; 인라인 배너 3곳은 05에서 `<Alert>`로 됐는지 확인.
  - `src/entrypoints/popup/main.tsx`: `./App`→`@/app/App`, `./style.css`→`@/app/styles/global.css`.
  - `src/entrypoints/app/main.tsx`: `../popup/App`→`@/app/App`, `../popup/style.css`→`@/app/styles/global.css` (**교차 import 냄새 제거**).
  - `.storybook/preview.ts`: `../src/entrypoints/popup/style.css`→`../src/app/styles/global.css` (확정 재타겟).
  - feature 간 형제 import(`./HeaderRow` 등) → `@/features/modifications/*` 등; `./Button`·`./i18n-context`·`./LargeEditor` → `@/ui/*`.
- **i18n-coverage 재작성(필수 — silent-failure 가드)**: `collectFiles()`를 재귀로 바꾸고 `join(dirname,'..','features')`와 `join(dirname,'.')`(ui) 둘 다 워크(`.tsx`, `!stories`, `!test` 필터). flat readdir면 features를 못 훑어 vacuous pass. **App.tsx(`src/app/`)도 스캔 대상에 포함** — Alert 배너 문자열 회귀 감지.

## Acceptance criteria

- [ ] `src/components/` 디렉토리가 비고 사라짐; 모든 컴포넌트가 `features/*`·`ui/`·`app/`에 위치
- [ ] `../popup/App` 교차 import 0건(`grep -rn "popup/App\|popup/style" src` 0건)
- [ ] i18n-coverage가 재귀 후 features/ui/app을 실제로 워크함 — **심은 하드코딩 영어 문자열에서 fail하는지 검증**한 뒤 원복
- [ ] 양 entrypoint(popup·tab)가 `@/app/App` 마운트, smoke green
- [ ] `bun run check`·`test`·`build`·`storybook:build` green
- [ ] Storybook 스토리 전부 로드(경로 재타겟 후 깨진 import 없음)

## Blocked by

02 (platform/runtime seam) + 06 (DS 채택 완료 — 파일 이동이 진행 중 채택과 충돌하지 않도록).

## Comments

**2026-07-15 완료** (commit `db9de62`). src/components/* → features/{7개}·ui·app 재편, App/style.css를 src/app으로 hoist, 교차 import(../popup/App) 제거, import 전수 갱신. i18n-coverage 재귀화(ui+features+app) + 심은 문자열 catch 검증. 검증 tsc0/test151/build/smoke48/storybook.
**후속(사용자 요청)**: 컴포넌트 파일명 kebab-case 전환 (commit `7c218d6`) — 전 .tsx/.stories를 kebab으로, import 경로 갱신, Storybook title 라벨 원복. 프론티어: 08(FilterRow, blocked-by 07)·09(background) 남음.
