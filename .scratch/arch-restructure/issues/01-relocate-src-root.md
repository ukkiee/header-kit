# 01 — 순수 이동: src/ 루트로 재배치 (워킹 스켈레톤)

Status: ready-for-agent
Blocked by: None - can start immediately

## Parent

`.scratch/arch-restructure/spec.md` (설계 SSOT: `docs/reviews/arch-restructure/design.md`)

## What to build

기존 루트 디렉토리(`core/ storage/ components/ entrypoints/`)를 **폴더명을 유지한 채** `src/` 아래로 통째 이동하고, 빌드 배선을 새 루트에 맞춘다. 소스 로직·스타일은 한 줄도 바꾸지 않는다 — 이후 모든 슬라이스가 이 새 루트 위에 쌓이므로 형태만 확정하는 워킹 스켈레톤이다.

- `git mv`로 이동: `core/`→`src/core/`, `storage/`→`src/storage/`, `components/`→`src/components/`, `entrypoints/`→`src/entrypoints/` (하위 `.ts`/`.tsx`/`.test.ts`/`.stories.tsx`/`.html`/`.css` 전부 포함).
- `wxt.config.ts`: `defineConfig`에 `srcDir: 'src'` 추가. WXT가 `.wxt/tsconfig.json`을 재생성해 `@/`·`~/`→`src/`로 alias가 자동 이동한다. **`.wxt/`는 직접 수정 금지** (git에도 커밋 안 함).
- `vitest.config.ts`: `include: ['src/**/*.test.ts?(x)']` + `resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), '~': fileURLToPath(new URL('./src', import.meta.url)) } }` 추가. vitest는 WXT alias를 읽지 않으므로 필수. `environment: 'node'` 유지.
- `.storybook/main.ts`: `stories: ['../src/**/*.stories.tsx']`, viteFinal의 하드코딩 alias를 `new URL('..')` → `new URL('../src', import.meta.url)`로(`@`,`~` 둘 다). tailwind vite 플러그인 등록 유지.
- `.storybook/preview.ts`: CSS import를 **잠정으로** `../src/entrypoints/popup/style.css`로 (App/css hoist는 슬라이스 07에서 확정 재타겟).
- `src/entrypoints/popup/main.tsx`·`app/main.tsx`: import **무변경** — `./App`·`./style.css`·`../popup/App`이 이동 후에도 상대경로로 해석됨. `index.html`의 `<script src="./main.tsx">` 상대 유지.
- `src/entrypoints/background.ts`: import **무변경** — `@/core/*`·`@/storage/*`가 폴더명 유지로 그대로 해석됨(runtime/platform 리네임은 슬라이스 02).
- `tsconfig.json`: 수정 불필요(`.wxt` include `../**/*`가 src 커버). exclude 유지, verify만.

**모든 배선 변경은 파일 이동과 같은 커밋에 착지해야 한다** — glob이 이동보다 늦으면 테스트가 green인 채 조용히 실행되지 않는다.

## Acceptance criteria

- [ ] `bun run check`(tsc) green
- [ ] `bun run test` green, **그리고 이전과 동일한 테스트 수(151)가 실제로 실행됨** — vacuous pass 아님(실행 개수 로그 확인)
- [ ] `bun run build`(wxt) green + `bun run storybook:build` green
- [ ] `bun run build` 후 `bun run smoke` green — 확장 로드·팝업·탭 앱 동작 불변
- [ ] `git show --stat`이 소스 파일에 대해 순수 rename(R100)만 보이고, 내용 diff는 배선 파일(`wxt.config.ts`/`vitest.config.ts`/`.storybook/*`)에만 국한됨 — 소스 로직·스타일 0 diff
- [ ] `.wxt/tsconfig.json`을 손대지 않았고 `@/` alias가 `src/`로 해석됨

## Blocked by

None - can start immediately. 다른 모든 슬라이스의 기반.

## Comments
