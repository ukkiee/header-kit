import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// vitest는 WXT가 생성하는 @/~ alias(.wxt/tsconfig.json)를 읽지 않으므로
// 여기서 src/ 루트로 직접 매핑한다 — 이동 파일이 @/를 쓰는 순간을 대비.
const src = fileURLToPath(new URL('./src', import.meta.url));

/**
 * 브라우저를 띄우는 테스트의 **이름 규약**. 두 명령의 대상이 이 한 값에서 파생되므로
 * 서로 배타적인 것이 구성으로 보장된다 — 두 자리에 손으로 적으면 어느 날 둘이 겹치거나
 * 사이에 구멍이 생기고, 그것을 알려 줄 것이 없다.
 *
 * `bun run test`         — 이 규약에 **해당하지 않는** 전부. CI가 도는 집합이다.
 * `bun run test:browser` — 이 규약에 해당하는 것만. 실제 크롬을 띄우므로 로컬에서 돈다.
 *
 * 어떤 파일이 어느 쪽인지는 이름이 아니라 **레지스트리의 `browser` 필드**가 정한다:
 * `browser: yes`인 게이트를 자식 프로세스로 띄우는 테스트는 이 이름을 써야 하고,
 * 그 분류가 지켜지는지는 `scripts/browser-parity.test.mjs`가 검사한다.
 */
const BROWSER_TESTS = '**/*.browser.test.mjs';
const browserOnly = process.env.HK_TEST_BROWSER === '1';

export default defineConfig({
  test: {
    // 게이트 스크립트의 테스트는 scripts/에 함께 산다.
    include: browserOnly ? [BROWSER_TESTS] : ['src/**/*.test.ts?(x)', 'scripts/**/*.test.mjs'],
    exclude: browserOnly ? ['**/node_modules/**'] : ['**/node_modules/**', BROWSER_TESTS],
    environment: 'node',
    // 실제 브라우저를 띄우는 쪽은 한 테스트가 확장 로드·렌더까지 기다린다.
    ...(browserOnly ? { testTimeout: 180_000, hookTimeout: 60_000 } : {}),
  },
  resolve: {
    alias: { '@': src, '~': src },
  },
});
