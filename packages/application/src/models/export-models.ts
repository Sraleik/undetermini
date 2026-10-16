import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { builtinModels } from '@undetermini/core/models/builtin';
import { planExport, type ExportFlag } from '@undetermini/core/models/export-plan';
import type { ModelKey } from '@undetermini/core/models/model';
import { findConfigFile } from '../config';
import { DEFAULT_DB_PATH } from '../storage/schema';
import { insertModels, newConfigText, renderModelsBlock } from './config-text';
import { readHistory } from './read-history';

const FLAG_NOTES: Record<ExportFlag['reason'], string> = {
  retired: 'retiré : absent de la liste intégrée, dernier prix connu',
  unpriced: 'sans prix : à renseigner',
};

export type ExportResult = {
  /** `refused`: no file was written; the report carries the block to paste. */
  status: 'written' | 'refused';
  flagged: ExportFlag[];
  /** Human-readable account of what happened, one fact per line. */
  report: string;
};

const flagLines = (flagged: ExportFlag[]): string[] =>
  flagged.map(({ key, reason }) => `- ${key} : ${FLAG_NOTES[reason]}`);

/** Where the copy of an existing config goes: `x.config.ts` → `x.config.old.ts`. */
const backupPath = (path: string): string => {
  const extension = extname(path);
  return join(dirname(path), `${basename(path, extension)}.old${extension}`);
};

/** Write the project's `models` from its history (or the starter pair), never
 *  editing an existing config in place: it is copied first (ADR 0003). */
export const exportModels = ({
  projectDir,
  configPath,
}: {
  projectDir: string;
  configPath?: string;
}): ExportResult => {
  const { models, flagged } = planExport({
    tried: readHistory(join(projectDir, DEFAULT_DB_PATH)),
    builtin: builtinModels(),
  });
  const notes: Partial<Record<ModelKey, string>> = Object.fromEntries(
    flagged.map(({ key, reason }) => [key, FLAG_NOTES[reason]]),
  );
  const block = renderModelsBlock(models, notes);
  const existing = configPath ?? findConfigFile(projectDir);

  const refuse = (why: string): ExportResult => ({
    status: 'refused',
    flagged,
    report: [why, 'Bloc à coller dans defineConfig({ … }) :', block, ...flagLines(flagged)].join(
      '\n',
    ),
  });

  let target: string;
  let text: string;
  if (existing === null) {
    target = join(projectDir, 'undetermini.config.ts');
    text = newConfigText(block);
  } else {
    const copy = backupPath(existing);
    if (existsSync(copy)) {
      return refuse(`${copy} existe déjà : rien n'est écrit, pour ne pas écraser cette copie.`);
    }
    const inserted = insertModels(readFileSync(existing, 'utf8'), block);
    if (!inserted.ok) {
      return refuse(
        inserted.reason === 'models-present'
          ? `${existing} déclare déjà \`models\` : rien n'est écrit.`
          : `${existing} ne contient pas \`defineConfig({\` : rien n'est écrit.`,
      );
    }
    copyFileSync(existing, copy);
    target = existing;
    text = inserted.text;
  }
  writeFileSync(target, text);
  return {
    status: 'written',
    flagged,
    report: [
      `${models.length} modèles écrits dans ${target}.`,
      ...flagLines(flagged),
    ].join('\n'),
  };
};
