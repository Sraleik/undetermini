/**
 * Promote an eval prompt to production: regenerate
 * core/search-engine/services/nl-ranking.system-prompt.ts byte-identical from a
 * promoted eval/prompts/*.md (escaping template-literal metacharacters, which a
 * manual copy would miss).
 *
 *   bun eval/scripts/promote-prompt.ts eval/prompts/v16-baseline.md
 *
 * The drift-guard test (nl-ranking.system-prompt.test.ts) hardcodes the
 * promoted .md path ON PURPOSE — it is the second sign-off on which variant
 * prod runs (if the test followed this script's output, regenerating from the
 * wrong file would pass green). Promoting a new file = run this script AND
 * update the test's path.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { sha256 } from '@eval/engine/cache/hash';

const TARGET = 'core/search-engine/services/nl-ranking.system-prompt.ts';

const sourceArg = process.argv[2];
if (!sourceArg) {
  console.error('usage: bun eval/scripts/promote-prompt.ts eval/prompts/<promoted>.md');
  process.exit(1);
}

const sourcePath = resolve(process.cwd(), sourceArg);
const content = readFileSync(sourcePath, 'utf8');
// Same content-address as the eval DB's system_prompts.id (= sha256 of the
// text) — the stamped prefix is greppable against stored eval lineages.
const promptSha = sha256(content).slice(0, 8);

// Escape template-literal metacharacters. The escapes round-trip: the runtime
// string stays byte-identical to the .md (the drift test proves it).
const escaped = content
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');

const header = `// GENERATED from eval/prompts/${basename(sourcePath)} (sha256 ${promptSha}) by
// eval/scripts/promote-prompt.ts — DO NOT edit by hand, regenerate instead.
// This is the production "ranking" NL-filter system prompt, promoted
// byte-identical from the winning eval variant so live behavior matches the
// evaluated trials (the eval cache key static_hash hashes this exact text).
// To promote a new version: win it in the eval first, then rerun the script.
// A drift-guard test asserts byte equality with the source .md.
`;

writeFileSync(
  resolve(process.cwd(), TARGET),
  `${header}export const NL_RANKING_SYSTEM_PROMPT = \`${escaped}\`;\n`,
);
console.log(
  `${TARGET} regenerated from ${basename(sourcePath)} (sha256 ${promptSha})`,
);
