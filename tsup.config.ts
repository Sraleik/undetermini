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
    // The barrel and `undetermini/clients` are built together, with splitting
    // on, so everything they share lands in one chunk both import. Built apart,
    // each would inline its own copy of the storage module — and that module
    // caches the SQLite connection at module scope, so a host importing from
    // both entry points would end up with two handles on the same file.
    entry: { index: 'src/index.ts', clients: 'src/clients/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'node22',
    platform: 'node',
    splitting: true,
    treeshake: true,
  },
  {
    // CommonJS for the barrel alone. `undetermini/clients` has no CJS build at
    // all: the TUI reaches ink, whose top-level await cannot survive a
    // `require`, so the subpath declares no `require` condition.
    entry: { index: 'src/index.ts' },
    format: ['cjs'],
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
