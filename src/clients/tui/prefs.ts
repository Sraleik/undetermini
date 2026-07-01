import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  KNOWN_COL_KEYS,
  KNOWN_SECTION_NAMES,
  type ColKey,
  type SectionName,
  type SortSpec,
} from '@eval/clients/cli/cli-args';
import type { DisplayOptions } from './store';

/**
 * Local "localStorage equivalent" for the eval TUI: the user's committed
 * display habits (visible columns, sort, sections) survive across runs.
 *
 * Best-effort by design — a missing, unreadable, or corrupt prefs file must
 * NEVER crash the TUI or alter behaviour. Every entry point swallows errors
 * and falls back to "no saved prefs".
 */

const KNOWN_COLS = new Set<ColKey>(KNOWN_COL_KEYS);
const KNOWN_SECTIONS = new Set<SectionName>(KNOWN_SECTION_NAMES);

export const prefsPath = (): string => {
  const base =
    process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.length > 0
      ? process.env.XDG_CONFIG_HOME
      : join(homedir(), '.config');
  return join(base, 'kalent-eval', 'tui.json');
};

type PrefsFile = {
  sections?: unknown;
  cols?: unknown;
  sort?: unknown;
};

const isSortSpec = (v: unknown): v is SortSpec =>
  typeof v === 'object' &&
  v !== null &&
  KNOWN_COLS.has((v as SortSpec).key) &&
  ((v as SortSpec).direction === 'asc' ||
    (v as SortSpec).direction === 'desc');

/** Returns saved display options, or null if absent/unreadable/corrupt. */
export const loadPrefs = (): DisplayOptions | null => {
  let parsed: PrefsFile;
  try {
    parsed = JSON.parse(readFileSync(prefsPath(), 'utf8')) as PrefsFile;
  } catch {
    return null;
  }
  try {
    const sectionsArr = Array.isArray(parsed.sections)
      ? parsed.sections.filter(
          (s): s is SectionName => KNOWN_SECTIONS.has(s as SectionName),
        )
      : [];
    const cols = Array.isArray(parsed.cols)
      ? new Set(
          parsed.cols.filter((c): c is ColKey => KNOWN_COLS.has(c as ColKey)),
        )
      : null;
    const sort = Array.isArray(parsed.sort)
      ? parsed.sort.filter(isSortSpec)
      : null;
    return {
      sections: new Set<SectionName>(sectionsArr),
      cols,
      sort,
    };
  } catch {
    return null;
  }
};

/** Persists display options. Failures are swallowed (best-effort). */
export const savePrefs = (display: DisplayOptions): void => {
  try {
    const path = prefsPath();
    mkdirSync(dirname(path), { recursive: true });
    const payload = {
      sections: [...display.sections],
      cols: display.cols === null ? null : [...display.cols],
      sort: display.sort,
    };
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch {
    // best-effort: never let a prefs write break the TUI
  }
};
