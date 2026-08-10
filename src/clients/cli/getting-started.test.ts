import { describe, expect, it } from 'vitest';
import { shouldShowGettingStarted } from './getting-started';

describe('shouldShowGettingStarted', () => {
  // The case that produced this guard: `npx undetermini` typed in a directory
  // with no config started 30 trials against a paid API without asking.
  it('holds back when no config was found and no subject was asked for', () => {
    expect(shouldShowGettingStarted(null, [])).toBe(true);
  });

  it('runs when a subject is named, even without a config', () => {
    expect(shouldShowGettingStarted(null, ['--subject=example'])).toBe(false);
    expect(shouldShowGettingStarted(null, ['--subject', 'example'])).toBe(
      false,
    );
  });

  it('runs whenever a project config was loaded', () => {
    expect(shouldShowGettingStarted('/some/project', [])).toBe(false);
  });
});
