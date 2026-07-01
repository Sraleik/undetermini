import { defineConfig } from 'tsup';

// Bundles the public barrel (`src/index.ts`) into a consumable package:
// - resolves the internal `@eval/*` tsconfig path aliases (consumers can't),
// - emits ESM (`index.js`) + CJS (`index.cjs`) + type declarations,
// - externalizes every runtime dependency (better-sqlite3, ai, ink, react…),
//   so natives and peer libs are never inlined.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node22',
  platform: 'node',
  splitting: false,
  treeshake: true,
});
