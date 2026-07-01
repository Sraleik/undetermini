// Ambient declaration for Bun's built-in `bun:sqlite` module, scoped to the
// eval scripts (run with `bun`, not the Node app). Keeps the repo typecheck
// green without adding @types/bun as a dependency. Only the surface used by
// eval/scripts is declared — extend if a script needs more.
//
// This file MUST stay a global (no top-level import/export) so `declare module`
// is an AMBIENT declaration, not a module augmentation.
declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string, options?: { readonly?: boolean });
    query(sql: string): { all(...params: unknown[]): unknown[] };
    close(): void;
  }
}
