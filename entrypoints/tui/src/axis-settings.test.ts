import { describe, expect, it } from 'vitest';
import type { Model } from '@undetermini/core/models/model';
import { buildModelEntries, declaredSettingNames } from './axis-settings';

const small: Model = {
  provider: 'mistral',
  id: 'small',
  price: [],
  settings: { 'think-1024': 1, 'think-4096': 2 },
};
const plain: Model = { provider: 'openai', id: 'plain', price: [] };
const low: Model = {
  provider: 'openai',
  id: 'gpt-5',
  price: [],
  settings: { 'eff-low': 1, 'think-1024': 3 },
};

describe('declaredSettingNames', () => {
  it('unions the names the chosen models declare, first seen first', () => {
    expect(declaredSettingNames([small, plain, low])).toEqual([
      'think-1024',
      'think-4096',
      'eff-low',
    ]);
  });

  it('is empty when no chosen model declares a setting', () => {
    expect(declaredSettingNames([plain])).toEqual([]);
  });
});

describe('buildModelEntries', () => {
  it('gives each model only the settings it declares, plus default if asked', () => {
    // Cas vécu : `eff-low` coché pour un modèle ne doit pas atterrir chez un
    // modèle qui ne le déclare pas — expandModels refuserait la variante.
    expect(
      buildModelEntries([small, low], new Set(['default', 'eff-low', 'think-4096'])),
    ).toEqual([
      { model: small, settingNames: ['default', 'think-4096'] },
      { model: low, settingNames: ['default', 'eff-low'] },
    ]);
  });

  it('falls back to the variant without a setting when nothing is checked', () => {
    expect(buildModelEntries([small], new Set())).toEqual([
      { model: small, settingNames: ['default'] },
    ]);
  });

  it('gives a model with no matching setting the default variant, never zero', () => {
    expect(buildModelEntries([plain], new Set(['eff-low']))).toEqual([
      { model: plain, settingNames: ['default'] },
    ]);
  });
});
