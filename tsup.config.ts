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
    // `undetermini/clients` — ESM only. The TUI reaches ink, whose top-level
    // await cannot survive a `require`, so no CJS build is emitted here.
    entry: { clients: 'src/clients/index.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    sourcemap: true,
    target: 'node22',
    platform: 'node',
    splitting: false,
    treeshake: true,
  },
  {
    entry: { cli: 'src/clients/cli/bin.ts', tui: 'src/clients/tui/bin.ts' },
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
