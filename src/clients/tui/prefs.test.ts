import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadPrefs, prefsPath, savePrefs } from './prefs';
import type { DisplayOptions } from './store';

let dir: string;
const origXdg = process.env.XDG_CONFIG_HOME;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kalent-prefs-'));
  process.env.XDG_CONFIG_HOME = dir;
});

afterEach(() => {
  if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = origXdg;
  rmSync(dir, { recursive: true, force: true });
});

describe('prefsPath', () => {
  it('honors XDG_CONFIG_HOME', () => {
    expect(prefsPath()).toBe(join(dir, 'kalent-eval', 'tui.json'));
  });
});

describe('save/load round-trip', () => {
  it('persists and restores cols/sort/sections, rebuilding Sets', () => {
    const display: DisplayOptions = {
      sections: new Set(['categories', 'assertions']),
      cols: new Set(['score', 'pass']),
      sort: [{ key: 'score', direction: 'desc' }],
    };
    savePrefs(display);
    const loaded = loadPrefs();
    expect(loaded).not.toBeNull();
    expect(loaded!.sections).toBeInstanceOf(Set);
    expect([...loaded!.sections].sort()).toEqual(['assertions', 'categories']);
    expect(loaded!.cols).toBeInstanceOf(Set);
    expect([...loaded!.cols!].sort()).toEqual(['pass', 'score']);
    expect(loaded!.sort).toEqual([{ key: 'score', direction: 'desc' }]);
  });

  it('round-trips null cols/sort', () => {
    savePrefs({ sections: new Set(['categories']), cols: null, sort: null });
    const loaded = loadPrefs();
    expect(loaded!.cols).toBeNull();
    expect(loaded!.sort).toBeNull();
  });

  it('creates the config dir when missing', () => {
    savePrefs({ sections: new Set(['categories']), cols: null, sort: null });
    expect(() => readFileSync(prefsPath(), 'utf8')).not.toThrow();
  });
});

describe('robustness', () => {
  it('returns null when the file is absent', () => {
    expect(loadPrefs()).toBeNull();
  });

  it('returns null on malformed JSON (no throw)', () => {
    const p = prefsPath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, '{ not valid json', 'utf8');
    expect(loadPrefs()).toBeNull();
  });

  it('drops unknown col and section keys', () => {
    const p = prefsPath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(
      p,
      JSON.stringify({
        sections: ['categories', 'bogus-section'],
        cols: ['score', 'not-a-col'],
        sort: [
          { key: 'score', direction: 'desc' },
          { key: 'ghost', direction: 'asc' },
        ],
      }),
      'utf8',
    );
    const loaded = loadPrefs();
    expect([...loaded!.sections]).toEqual(['categories']);
    expect([...loaded!.cols!]).toEqual(['score']);
    expect(loaded!.sort).toEqual([{ key: 'score', direction: 'desc' }]);
  });

  it('savePrefs never throws on an unwritable path', () => {
    // `/dev/null` is a file, so mkdir under it fails fast with ENOTDIR on any
    // Linux. (A `/proc/...` path can block instead of erroring on some kernels,
    // e.g. 6.11, which would hang the test rather than exercise the swallow.)
    process.env.XDG_CONFIG_HOME = '/dev/null/cannot-write';
    expect(() =>
      savePrefs({ sections: new Set(['categories']), cols: null, sort: null }),
    ).not.toThrow();
  });
});
