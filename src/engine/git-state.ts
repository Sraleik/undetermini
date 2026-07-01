import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type GitState = { sha: string; branch: string; dirty: boolean };

const sh = (cmd: string): string =>
  execSync(cmd, { encoding: 'utf8' }).toString().trim();

export const readGitState = (): GitState => ({
  sha: sh('git rev-parse HEAD'),
  branch: sh('git rev-parse --abbrev-ref HEAD'),
  dirty: sh('git status --porcelain').length > 0,
});

export const datasetHash = (dir: string): string => {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.case.ts'))
    .sort();
  const hash = createHash('sha256');
  for (const f of files) {
    hash.update(f);
    hash.update('\0');
    hash.update(readFileSync(join(dir, f)));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
};

export const promptSha256 = (text: string): string =>
  `sha256:${createHash('sha256').update(text).digest('hex')}`;
