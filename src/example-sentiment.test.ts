import { describe, expect, it } from 'vitest';
import {
  buildProviderOptions,
  clientFor,
  exampleSentimentSubject,
} from '@undetermini/examples/example-sentiment/sentiment.subject';

// Ce test vit sous src/ et non à côté de l'exemple : vitest.config.ts n'inclut pas examples/.
describe('le sujet d\'exemple suit le contrat des sujets', () => {
  it('lève une erreur nommée sur un fournisseur qu\'il ne sert pas', () => {
    expect(() => clientFor('mistral')).toThrow(/mistral/);
  });

  it('traduit variant.setting en options du fournisseur', () => {
    expect(
      buildProviderOptions({
        name: 'gpt-5.4-mini__eff-low',
        provider: 'openai',
        modelId: 'gpt-5.4-mini',
        setting: { reasoningEffort: 'low' },
      }),
    ).toEqual({ openai: { reasoningEffort: 'low' } });
  });

  it('ne renvoie aucune option pour une variante sans réglage', () => {
    expect(
      buildProviderOptions({ name: 'm', provider: 'openai', modelId: 'm' }),
    ).toBeUndefined();
  });

  it('refuse de traduire un réglage pour un fournisseur non servi', () => {
    expect(() =>
      buildProviderOptions({
        name: 'x',
        provider: 'mistral',
        modelId: 'x',
        setting: { reasoningEffort: 'low' },
      }),
    ).toThrow(/mistral/);
  });

  it('expose le même traducteur dans le sujet', () => {
    expect(exampleSentimentSubject.buildProviderOptions).toBe(buildProviderOptions);
  });
});
