import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/server/**/__tests__/**/*.test.ts', 'src/server/**/__tests__/**/*.test.tsx', 'src/server/**/__tests__/**/*.spec.ts'],
    globals: false,
  },
  // Ensure vitest does not try to execute the full Vite plugin chain used for devvit
  // by keeping the Vite config surface minimal here.
  esbuild: {},
});
