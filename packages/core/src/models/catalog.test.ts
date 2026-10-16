import { describe, expect, it } from 'vitest';
import { decodeCatalog } from './catalog';

const price = [
  { from: '2026-01-01', input: '1', output: '2', cachedInput: '0.5' },
];

const decodeOk = (raw: unknown) => {
  const result = decodeCatalog(raw);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result;
};

const decodeErrors = (raw: unknown): string[] => {
  const result = decodeCatalog(raw);
  if (result.ok) throw new Error('refus attendu');
  return result.errors;
};

describe('decodeCatalog', () => {
  it('accepts a provider the lib has never heard of', () => {
    const { catalog } = decodeOk([
      { provider: 'mistral', id: 'mistral-small', price },
    ]);
    expect(catalog.find('mistral', 'mistral-small')?.id).toBe('mistral-small');
  });

  it('refuses a payload that is not a list', () => {
    expect(decodeErrors({ provider: 'mistral' })).toHaveLength(1);
  });

  // Cas vécu : le moteur devinait « c'est Anthropic » pour tout fournisseur absent.
  it.each([undefined, ''])('refuses provider %j and names the model', (provider) => {
    const errors = decodeErrors([{ provider, id: 'mistral-small', price }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/mistral-small/);
    expect(errors[0]).toMatch(/provider/);
  });

  it('refuses a model without id and names its rank in the list', () => {
    const errors = decodeErrors([
      { provider: 'openai', id: 'gpt-5', price },
      { provider: 'openai', price },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/n°2/);
    expect(errors[0]).toMatch(/\bid\b/);
  });

  it('refuses two declarations of the same provider + id', () => {
    const errors = decodeErrors([
      { provider: 'openai', id: 'gpt-5', price },
      { provider: 'openai', id: 'gpt-5', price },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/openai:gpt-5/);
  });

  it('accepts the same id under two providers', () => {
    const { catalog } = decodeOk([
      { provider: 'anthropic', id: 'sonnet', price },
      { provider: 'openrouter', id: 'sonnet', price },
    ]);
    expect(catalog.models).toHaveLength(2);
  });

  // Cas vécu : la virgule française, recopiée de la page d'un fournisseur.
  it('refuses a malformed price and names provider:id and the field', () => {
    const errors = decodeErrors([
      {
        provider: 'openai',
        id: 'gpt-5',
        price: [{ ...price[0], input: '0,075' }],
      },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/openai:gpt-5/);
    expect(errors[0]).toMatch(/input/);
  });

  it('refuses two periods starting on the same day', () => {
    const errors = decodeErrors([
      { provider: 'openai', id: 'gpt-5', price: [price[0], price[0]] },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/openai:gpt-5/);
    expect(errors[0]).toMatch(/2026-01-01/);
  });

  it('sorts unsorted periods instead of refusing them', () => {
    const later = { ...price[0], from: '2026-09-01' };
    const { catalog } = decodeOk([
      { provider: 'openai', id: 'gpt-5', price: [later, price[0]] },
    ]);
    expect(catalog.find('openai', 'gpt-5')?.price.map((p) => p.from)).toEqual([
      '2026-01-01',
      '2026-09-01',
    ]);
  });

  it('reports every faulty model, not only the first', () => {
    const errors = decodeErrors([
      { id: 'a', price },
      { provider: 'openai', id: 'b', price: [{ ...price[0], output: 'x' }] },
    ]);
    expect(errors).toHaveLength(2);
  });

  it('checks the shape of settings and never looks inside', () => {
    const settings = { 'eff-low': { anything: ['goes', 1] }, odd: 42 };
    const { catalog } = decodeOk([
      { provider: 'openai', id: 'gpt-5', price, settings },
    ]);
    expect(catalog.find('openai', 'gpt-5')?.settings).toEqual(settings);
    expect(
      decodeErrors([{ provider: 'openai', id: 'gpt-5', price, settings: [1] }]),
    ).toHaveLength(1);
  });

  it('warns, never refuses, when the price is empty or absent', () => {
    const { catalog, warnings } = decodeOk([
      { provider: 'mistral', id: 'mistral-small', price: [] },
      { provider: 'openai', id: 'gpt-5' },
    ]);
    expect(catalog.models).toHaveLength(2);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/mistral:mistral-small/);
    expect(warnings[0]).toMatch(/prix inconnu/);
    expect(catalog.find('openai', 'gpt-5')?.price).toEqual([]);
  });

  it('keeps the declared order and the retired mark', () => {
    const { catalog } = decodeOk([
      { provider: 'b', id: 'two', price },
      { provider: 'a', id: 'one', price, retired: true },
    ]);
    expect(catalog.models.map((m) => m.id)).toEqual(['two', 'one']);
    expect(catalog.find('a', 'one')?.retired).toBe(true);
  });
});

describe('Catalog.resolveRef', () => {
  const { catalog } = decodeOk([
    { provider: 'anthropic', id: 'sonnet', price },
    { provider: 'openrouter', id: 'sonnet', price },
    { provider: 'openai', id: 'gpt-5', price },
    { provider: 'openrouter', id: 'vendor/model:free', price },
  ]);

  it('resolves provider:id, cutting at the first colon only', () => {
    const resolved = catalog.resolveRef('openai:gpt-5');
    expect(resolved.ok && resolved.model.id).toBe('gpt-5');
    const colon = catalog.resolveRef('openrouter:vendor/model:free');
    expect(colon.ok && colon.model.id).toBe('vendor/model:free');
  });

  it('resolves a bare id when it is unique', () => {
    const resolved = catalog.resolveRef('gpt-5');
    expect(resolved.ok && resolved.model.provider).toBe('openai');
  });

  it('refuses an ambiguous bare id and lists the candidate pairs', () => {
    const resolved = catalog.resolveRef('sonnet');
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error).toMatch(/anthropic:sonnet/);
    expect(resolved.error).toMatch(/openrouter:sonnet/);
  });

  it('opens an undeclared openrouter:<id> as a one-off, without price or settings', () => {
    const resolved = catalog.resolveRef('openrouter:vendor/other');
    expect(resolved).toEqual({
      ok: true,
      model: { provider: 'openrouter', id: 'vendor/other', price: [] },
    });
  });

  it('refuses an undeclared model of any other provider', () => {
    const resolved = catalog.resolveRef('mistral:mistral-small');
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error).toMatch(/mistral:mistral-small/);
  });

  it('refuses an unknown bare id', () => {
    expect(catalog.resolveRef('nope').ok).toBe(false);
  });
});
