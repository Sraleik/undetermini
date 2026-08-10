import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Les paquets s'atteignent par les mêmes alias qu'en typecheck (tsconfig.json).
// Tant que les workspaces bun ne sont pas posés, c'est ici que la résolution vit.
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@undetermini/core': at('./packages/core/src'),
      '@undetermini/application': at('./packages/application/src'),
      '@undetermini/cli': at('./entrypoints/cli/src'),
      '@undetermini/tui': at('./entrypoints/tui/src'),
      '@undetermini/examples': at('./examples'),
    },
  },
  test: {
    include: [
      'src/**/*.test.ts',
      'packages/**/*.test.ts',
      'entrypoints/**/*.test.ts',
      'entrypoints/**/*.test.tsx',
    ],
  },
});
