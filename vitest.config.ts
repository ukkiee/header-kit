import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['core/**/*.test.ts', 'components/**/*.test.ts?(x)'],
    environment: 'node',
  },
});
