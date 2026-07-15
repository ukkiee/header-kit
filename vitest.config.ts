import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// vitest는 WXT가 생성하는 @/~ alias(.wxt/tsconfig.json)를 읽지 않으므로
// 여기서 src/ 루트로 직접 매핑한다 — 이동 파일이 @/를 쓰는 순간을 대비.
const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts?(x)'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': src, '~': src },
  },
});
