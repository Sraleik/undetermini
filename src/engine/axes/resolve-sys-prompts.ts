import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import type { SysPromptAxisValue } from './axis-inputs';

export const DEFAULT_PROMPTS_DIR = 'eval/prompts';

/**
 * Resolve a list of `--sys-prompts` CLI tokens into concrete `SysPromptAxisValue`s.
 *
 * Token grammar:
 * - `default`          → no override (baseline used at runtime)
 * - `./path/file.md`   → read file as-is, display name = basename without `.md`
 * - `/abs/path/file.md`→ same, absolute path
 * - `<name>`           → read `<promptsDir>/<name>.md`, display name = `<name>`
 *
 * `promptsDir` is the subject's prompt library (defaults to `eval/prompts`, the
 * talent/nl-filter lineage). A bare `<name>` token is resolved relative to it,
 * so a subject with its own prompt folder resolves against that folder.
 *
 * Throws with a helpful error if a file is missing — silent fallback would mask
 * typos and produce confusing "0 variants" failures downstream.
 */
export const resolveSysPrompts = (
  tokens: string[],
  promptsDir: string = DEFAULT_PROMPTS_DIR,
): SysPromptAxisValue[] => tokens.map((token) => resolveOne(token, promptsDir));

const resolveOne = (
  token: string,
  promptsDir: string,
): SysPromptAxisValue => {
  if (token === 'default') return 'default';

  if (isPathLike(token)) {
    const absolutePath = isAbsolute(token) ? token : resolve(token);
    if (!existsSync(absolutePath)) {
      throw new Error(
        `--sys-prompts file not found: ${token} (resolved to ${absolutePath})`,
      );
    }
    return {
      name: basename(token).replace(/\.md$/, ''),
      text: readFileSync(absolutePath, 'utf8'),
    };
  }

  const absolutePath = resolve(promptsDir, `${token}.md`);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `--sys-prompts could not resolve '${token}' — expected ${promptsDir}/${token}.md to exist. Use 'default' for the baseline or pass a relative path (./...).`,
    );
  }
  return { name: token, text: readFileSync(absolutePath, 'utf8') };
};

const isPathLike = (token: string) =>
  token.startsWith('./') || token.startsWith('../') || token.startsWith('/');
