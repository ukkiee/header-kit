# 02 — runtime/ 분리 + platform/ 리네임

Status: done
Blocked by: 01

## Parent

`.scratch/arch-restructure/spec.md` (설계 SSOT: `docs/reviews/arch-restructure/design.md`)

## What to build

동시성 정책 모듈을 core에서 분리해 `runtime/` 레이어를 만들고, 어댑터 디렉토리 `storage/`를 정직한 이름 `platform/`으로 리네임한다. 이로써 `core`가 "순수 도출"임이 증명되고 레이어 순서가 core→runtime→platform으로 명료해진다. 동작 변경 없음.

- `git mv src/core/executor.ts src/runtime/executor.ts` + `executor.test.ts` 동반 이동.
- `git mv src/core/reconciler.ts src/runtime/reconciler.ts` + `reconciler.test.ts` 동반 이동. (executor·reconciler는 주입 deps를 받는 FIFO/세대 코얼레싱 — 도메인 아님.)
- `git mv src/storage/ src/platform/`; `state.ts` → `stateStore.ts`로 파일 리네임. `tabs.ts`·`backupStore.ts`는 이름 유지.
- import 전수 치환 (`grep`으로 확인, 부분 열거 금지):
  - `@/core/executor`→`@/runtime/executor`, `@/core/reconciler`→`@/runtime/reconciler`
  - `@/storage/state`→`@/platform/stateStore`, `@/storage/tabs`→`@/platform/tabs`, `@/storage/backupStore`→`@/platform/backupStore`
  - 알려진 importer: `src/entrypoints/background.ts`(executor·reconciler·stateStore·backupStore·tabs), `src/components/BackupPanel.tsx`(backupStore), `src/components/ProfileSection.tsx`(tabs 타입), `src/entrypoints/popup/App.tsx`(stateStore·tabs), 이동한 두 테스트, 해당 stories. **반드시 `grep -rn "@/storage/\|@/core/executor\|@/core/reconciler" src` 로 전수 확인.**
- vitest glob은 슬라이스 01에서 이미 `src/**` → runtime 테스트 자동 포함(glob 변경 불필요, 확인만).

## Acceptance criteria

- [ ] `grep -rn "@/storage/" src`·`grep -rn "@/core/executor\|@/core/reconciler" src` 결과 0건
- [ ] `bun run check` green, `bun run test` green(runtime 테스트가 실제 실행됨 확인)
- [ ] `bun run build` green, `bun run build` 후 `bun run smoke` green
- [ ] `bun run storybook:build` green
- [ ] `src/core/`에 executor/reconciler가 더 이상 없고, core 모듈이 브라우저 API·주입 동시성 deps를 import하지 않음(순수성)

## Blocked by

01 — src/ 루트가 존재해야 함.

## Comments

**2026-07-15 구현 완료** (commit `416f5b2`)

- `git mv`: executor·reconciler(+테스트) → `src/runtime/`, `src/storage/` → `src/platform/`, `state.ts` → `stateStore.ts`. backupStore/tabs 이름 유지.
- import 치환: 이동 파일의 상대→`@/core/*`(executor `./commands`·`./schema`, reconciler `./compile`, 테스트 `./schema`; 동일 디렉토리 `./executor`·`./reconciler`는 상대 유지). importer 5곳(background·App·FilterRow·BackupPanel·ProfileSection) `@/storage/*`→`@/platform/*`·`@/core/{executor,reconciler}`→`@/runtime`.
- 게이트: `grep -rn "@/storage/\|@/core/executor\|@/core/reconciler" src` = **0**.
- **검증**: tsc 0 / test 151·19 / build / smoke 48/48 / storybook green. 동작 불변.
- **코드리뷰**(02+03 합본, since 624dc58): Spec축 "슬라이스 02 계약 준수, 스코프크립 0". Standards축 위반 0.
