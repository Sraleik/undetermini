import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import type { SysPromptAxisValue } from './axis-inputs';

const PROMPTS_DIR = 'eval/prompts';

/**
 * Resolve a list of `--sys-prompts` CLI tokens into concrete `SysPromptAxisValue`s.
 *
 * Token grammar:
 * - `default`          → no override (baseline used at runtime)
 * - `./path/file.md`   → read file as-is, display name = basename without `.md`
 * - `/abs/path/file.md`→ same, absolute path
 * - `<name>`           → read `eval/prompts/<name>.md`, display name = `<name>`
 *
 * Throws with a helpful error if a file is missing — silent fallback would mask
 * typos and produce confusing "0 variants" failures downstream.
 */
export const resolveSysPrompts = (tokens: string[]): SysPromptAxisValue[] =>
  tokens.map(resolveOne);

const resolveOne = (token: string): SysPromptAxisValue => {
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

  const absolutePath = resolve(PROMPTS_DIR, `${token}.md`);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `--sys-prompts could not resolve '${token}' — expected ${PROMPTS_DIR}/${token}.md to exist. Use 'default' for the baseline or pass a relative path (./...).`,
    );
  }
  return { name: token, text: readFileSync(absolutePath, 'utf8') };
};

const isPathLike = (token: string) =>
  token.startsWith('./') || token.startsWith('../') || token.startsWith('/');
