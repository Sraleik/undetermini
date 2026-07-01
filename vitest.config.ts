import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The engine + clients import through the `@eval/*` alias (same as the runtime
// tsx path mapping in tsconfig.json). Vitest resolves it here to `./src/*`.
export default defineConfig({
  resolve: {
    alias: {
      '@eval': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
