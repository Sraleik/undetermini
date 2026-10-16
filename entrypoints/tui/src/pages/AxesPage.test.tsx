import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import type { Model } from '@undetermini/core/models/model';
import { AxesPage } from './AxesPage';
import { initialWizardState } from '../store';
import type { EvalCliArgs } from '@undetermini/cli/cli-args';

const args: EvalCliArgs = {
  subject: null,
  trialCount: 30,
  maxConcurrency: 5,
  cacheMode: 'auto',
  caseSlugs: null,
  sections: new Set(),
  cols: null,
  sort: null,
  cartesian: null,
};

// Un fournisseur que le moteur ne connaissait pas, déclaré avec deux réglages
// nommés : le cas qui a motivé la feature (Mistral, sans publication de la lib).
const MODELS: Model[] = [
  {
    provider: 'mistral',
    id: 'small',
    price: [],
    settings: { 'think-1024': { budget: 1024 }, 'think-4096': { budget: 4096 } },
  },
  { provider: 'openai', id: 'plain', price: [] },
];

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

const renderPage = () =>
  render(
    <AxesPage
      models={MODELS}
      prompts={[]}
      schemas={[]}
      state={initialWizardState({ cases: [], variants: [] }, args)}
      dispatch={() => {}}
      onNext={() => {}}
      onBack={() => {}}
    />,
  );

describe('AxesPage', () => {
  it('lists the declared models, whatever their provider', () => {
    const { lastFrame } = renderPage();
    expect(lastFrame()).toContain('small');
    expect(lastFrame()).toContain('mistral');
    expect(lastFrame()).toContain('plain');
  });

  it('shows no settings section while no chosen model declares a setting', () => {
    const { lastFrame } = renderPage();
    expect(lastFrame()).not.toContain('Réglages du modèle');
  });

  it('shows the setting names declared by the chosen model, nothing else', async () => {
    const { lastFrame, stdin } = renderPage();
    await tick();
    stdin.write(' ');
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Réglages du modèle');
    expect(frame).toContain('think-1024');
    expect(frame).toContain('think-4096');
    expect(frame).not.toContain('Reasoning effort');
    expect(frame).not.toContain('Thinking budget');
  });
});
