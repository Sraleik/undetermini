import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { sha256 } from './hash';
import { buildKeyFromCallOptions } from './key-builder';

const baseParams = (
  overrides: Partial<LanguageModelV3CallOptions> = {},
): LanguageModelV3CallOptions => ({
  prompt: [
    { role: 'system', content: 'You are an extractor.' },
    { role: 'user', content: [{ type: 'text', text: 'find me python devs' }] },
  ],
  temperature: 0,
  ...overrides,
});

describe('buildKeyFromCallOptions', () => {
  it('hashes system messages separately from user messages', () => {
    const k = buildKeyFromCallOptions('gpt-4.1', baseParams());
    expect(k.systemPromptSha).toBe(
      sha256([{ role: 'system', content: 'You are an extractor.' }]),
    );
    expect(k.promptSha).toBe(
      sha256([
        {
          role: 'user',
          content: [{ type: 'text', text: 'find me python devs' }],
        },
      ]),
    );
  });

  it('staticHash changes when systemPrompt changes', () => {
    const a = buildKeyFromCallOptions('gpt-4.1', baseParams());
    const b = buildKeyFromCallOptions(
      'gpt-4.1',
      baseParams({
        prompt: [
          { role: 'system', content: 'Different system.' },
          {
            role: 'user',
            content: [{ type: 'text', text: 'find me python devs' }],
          },
        ],
      }),
    );
    expect(a.staticHash).not.toBe(b.staticHash);
  });

  it('staticHash changes when modelId changes', () => {
    const a = buildKeyFromCallOptions('gpt-4.1', baseParams());
    const b = buildKeyFromCallOptions('claude-opus-4-7', baseParams());
    expect(a.staticHash).not.toBe(b.staticHash);
  });

  it('staticHash changes when responseFormat schema changes', () => {
    const a = buildKeyFromCallOptions(
      'gpt-4.1',
      baseParams({
        responseFormat: { type: 'json', schema: { type: 'object' } as never },
      }),
    );
    const b = buildKeyFromCallOptions(
      'gpt-4.1',
      baseParams({
        responseFormat: {
          type: 'json',
          schema: { type: 'object', properties: {} } as never,
        },
      }),
    );
    expect(a.staticHash).not.toBe(b.staticHash);
  });

  it('staticHash changes when temperature changes', () => {
    const a = buildKeyFromCallOptions('gpt-4.1', baseParams({ temperature: 0 }));
    const b = buildKeyFromCallOptions('gpt-4.1', baseParams({ temperature: 1 }));
    expect(a.staticHash).not.toBe(b.staticHash);
  });

  it('promptSha changes when user prompt changes — staticHash stable', () => {
    const a = buildKeyFromCallOptions('gpt-4.1', baseParams());
    const b = buildKeyFromCallOptions(
      'gpt-4.1',
      baseParams({
        prompt: [
          { role: 'system', content: 'You are an extractor.' },
          {
            role: 'user',
            content: [{ type: 'text', text: 'find me react devs' }],
          },
        ],
      }),
    );
    expect(a.promptSha).not.toBe(b.promptSha);
    expect(a.staticHash).toBe(b.staticHash);
  });

  it('canonical hash — key order insensitive', () => {
    const a = sha256({ a: 1, b: 2 });
    const b = sha256({ b: 2, a: 1 });
    expect(a).toBe(b);
  });
});
