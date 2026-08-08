import { describe, expect, it } from 'vitest';
import { toOpenAiReasoningEffort } from './model-capabilities';

describe('toOpenAiReasoningEffort', () => {
  it('maps minimal to none for gpt-5.1+ frontier models', () => {
    expect(toOpenAiReasoningEffort('gpt-5.4', 'minimal')).toBe('none');
    expect(toOpenAiReasoningEffort('gpt-5.4-mini', 'minimal')).toBe('none');
    expect(toOpenAiReasoningEffort('gpt-5.5', 'minimal')).toBe('none');
  });

  it('keeps minimal for gpt-5 family models', () => {
    expect(toOpenAiReasoningEffort('gpt-5-mini', 'minimal')).toBe('minimal');
    expect(toOpenAiReasoningEffort('gpt-5', 'minimal')).toBe('minimal');
  });

  it('passes through other effort values unchanged', () => {
    expect(toOpenAiReasoningEffort('gpt-5.4', 'high')).toBe('high');
    expect(toOpenAiReasoningEffort('gpt-5-mini', 'low')).toBe('low');
  });
});
