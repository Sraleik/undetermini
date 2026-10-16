import { describe, expect, it } from 'vitest';
import { modelKey } from './model';

describe('modelKey', () => {
  it('pairs provider and id', () => {
    expect(modelKey({ provider: 'mistral', id: 'large' })).toBe(
      'mistral:large',
    );
  });

  // Cas vécu : Sonnet en direct et via OpenRouter sont deux modèles.
  it('tells the same id apart across providers', () => {
    expect(modelKey({ provider: 'anthropic', id: 'claude-sonnet-4-6' })).not.toBe(
      modelKey({ provider: 'openrouter', id: 'claude-sonnet-4-6' }),
    );
  });
});
