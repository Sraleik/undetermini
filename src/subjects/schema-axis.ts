import type { SchemaAxisValue } from '@eval/engine/axes/axis-inputs';
import type { RegisteredSchema } from '@eval/subjects/registry';

/** Resolve `--schemas` CLI tokens against a subject's declared schema library —
 *  the schema-axis mirror of `resolveSysPrompts`. `'default'` passes through;
 *  anything else must be a declared name, validated eagerly so a typo fails
 *  before any LLM call rather than mid-run inside `runOne`.
 *
 *  The library is passed in rather than imported: which schemas exist is the
 *  subject's business, not the harness's. */
export const resolveSchemaAxis = (
  tokens: readonly string[],
  schemas: readonly RegisteredSchema<unknown>[] = [],
): SchemaAxisValue[] =>
  tokens.map((token) => {
    if (token === 'default') return 'default';
    const entry = schemas.find((s) => s.name === token);
    if (entry === undefined) {
      const declared = schemas.map((s) => s.name).join(', ');
      throw new Error(
        `Unknown schema '${token}'. Declared for this subject: ${declared === '' ? '(none)' : declared} (or 'default').`,
      );
    }
    return { name: entry.name };
  });
