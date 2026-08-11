import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// vitest는 WXT가 생성하는 @/~ alias(.wxt/tsconfig.json)를 읽지 않으므로
// 여기서 src/ 루트로 직접 매핑한다 — 이동 파일이 @/를 쓰는 순간을 대비.
const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    // 게이트 스크립트의 테스트는 scripts/에 함께 산다. 브라우저를 띄우는 것은
    // `*.browser.test.mjs`로 이름 지어 이 집합에서 빠지고 `test:browser`가 돈다 —
    // 그 규약은 티켓 07이 채우고, 지금은 대상이 없어도 제외를 미리 세워 둔다.
    include: ['src/**/*.test.ts?(x)', 'scripts/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/*.browser.test.mjs'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': src, '~': src },
  },
});
