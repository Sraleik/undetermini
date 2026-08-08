import { defineConfig } from 'tsup';

// Bundles the public barrel (`src/index.ts`) plus the two executables into a
// consumable package:
// - resolves the internal `@eval/*` tsconfig path aliases (consumers can't),
// - emits ESM (`index.js`) + CJS (`index.cjs`) + type declarations,
// - externalizes every runtime dependency (better-sqlite3, ai, ink, react…),
//   so natives and peer libs are never inlined.
//
// The CLI and the TUI ship with the package: a host declares a subject and gets
// both runners, with no client code of its own to write.
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'node22',
    platform: 'node',
    splitting: false,
    treeshake: true,
  },
  {
    entry: { cli: 'src/clients/cli/runner.ts', tui: 'src/clients/tui/runner.ts' },
    format: ['esm'],
    dts: false,
    clean: false,
    sourcemap: true,
    target: 'node22',
    platform: 'node',
    splitting: false,
    treeshake: true,
    banner: { js: '#!/usr/bin/env node' },
  },
]);
