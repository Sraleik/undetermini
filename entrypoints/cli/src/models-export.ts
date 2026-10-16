import { dirname, isAbsolute, resolve } from 'node:path';
import { findConfigFile } from '@undetermini/application/config';
import { exportModels } from '@undetermini/application/models/export-models';

/** `undetermini models export`: returns the process exit code. A refusal writes
 *  nothing and exits non-zero, so a script notices that no file changed. */
export const runModelsExport = ({
  configPath,
  cwd,
  print = console.log,
}: {
  configPath?: string;
  cwd: string;
  print?: (line: string) => void;
}): number => {
  const explicit =
    configPath === undefined
      ? undefined
      : isAbsolute(configPath)
        ? configPath
        : resolve(cwd, configPath);
  const found = explicit ?? findConfigFile(cwd) ?? undefined;
  const result = exportModels({
    projectDir: found === undefined ? cwd : dirname(found),
    configPath: found,
  });
  print(result.report);
  return result.status === 'written' ? 0 : 1;
};

export const isModelsExport = (args: readonly string[]): boolean =>
  args[0] === 'models' && args[1] === 'export';
