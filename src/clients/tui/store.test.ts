import { describe, expect, it } from 'vitest';
import {
  initialWizardState,
  wizardReducer,
  type WizardState,
} from './store';
import type { EvalCliArgs } from '@eval/clients/cli/cli-args';
import type { EvalCase } from '@eval/engine/types';

const baseArgs = (): EvalCliArgs => ({
  subject: null,
  trialCount: 30,
  maxConcurrency: 5,
  cacheMode: 'auto',
  caseSlugs: null,
  sections: new Set(),
  cols: null,
  sort: null,
  cartesian: null,
});

const baseSubject = () => ({
  cases: [
    { slug: 'case-a', input: '', expectedOutput: null, assertions: [] },
    { slug: 'case-b', input: '', expectedOutput: null, assertions: [] },
  ] as unknown as EvalCase[],
  variants: [],
});

describe('initialWizardState', () => {
  it('preselects every case when --case-slugs is null', () => {
    const state = initialWizardState(baseSubject(), baseArgs());
    expect(state.selectedCases.map((c) => c.slug)).toEqual([
      'case-a',
      'case-b',
    ]);
  });

  it('filters cases when --case-slugs is provided', () => {
    const args = { ...baseArgs(), caseSlugs: ['case-b'] };
    const state = initialWizardState(baseSubject(), args);
    expect(state.selectedCases.map((c) => c.slug)).toEqual(['case-b']);
  });

  it('seeds axes from CLI cartesian payload when present', () => {
    const args: EvalCliArgs = {
      ...baseArgs(),
      cartesian: {
        models: [{ provider: 'openai', modelId: 'gpt-4o-mini' }],
        reasoningEfforts: ['default', 'low'],
        thinkingBudgets: ['default'],
        sysPromptTokens: [],
      },
    };
    const state = initialWizardState(baseSubject(), args);
    expect(state.axes.models).toEqual([
      { provider: 'openai', modelId: 'gpt-4o-mini' },
    ]);
    expect(state.axes.reasoningEfforts).toEqual(['default', 'low']);
  });

  it('defaults trialCount to args.trialCount', () => {
    const state = initialWizardState(baseSubject(), {
      ...baseArgs(),
      trialCount: 42,
    });
    expect(state.trialCount).toBe(42);
  });
});

describe('wizardReducer', () => {
  const seed = (): WizardState => initialWizardState(baseSubject(), baseArgs());

  it('setCases replaces the selected cases array', () => {
    const next = wizardReducer(seed(), {
      type: 'setCases',
      cases: [{ slug: 'case-a' } as unknown as EvalCase],
    });
    expect(next.selectedCases).toHaveLength(1);
    expect(next.selectedCases[0].slug).toBe('case-a');
  });

  it('setTrialCount updates only the trialCount field', () => {
    const before = seed();
    const next = wizardReducer(before, {
      type: 'setTrialCount',
      trialCount: 100,
    });
    expect(next.trialCount).toBe(100);
    expect(next.selectedCases).toBe(before.selectedCases);
  });

  it('reseed replaces the entire state with the provided seed', () => {
    const before: WizardState = {
      ...seed(),
      trialCount: 999,
      selectedCases: [{ slug: 'stale' } as unknown as EvalCase],
    };
    const fresh = initialWizardState(baseSubject(), baseArgs());
    const next = wizardReducer(before, { type: 'reseed', state: fresh });
    expect(next).toBe(fresh);
    expect(next.selectedCases.map((c) => c.slug)).toEqual(['case-a', 'case-b']);
    expect(next.trialCount).toBe(30);
  });

  it('resetForRerun clears runResult but keeps user choices', () => {
    const withResult: WizardState = {
      ...seed(),
      runResult: { trials: [], variants: [], cases: [] } as never,
    };
    const next = wizardReducer(withResult, { type: 'resetForRerun' });
    expect(next.runResult).toBeNull();
    expect(next.selectedCases).toBe(withResult.selectedCases);
    expect(next.trialCount).toBe(withResult.trialCount);
  });
});
