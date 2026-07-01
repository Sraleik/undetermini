import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeEvalDb, openEvalDb } from './storage/schema';
import { EvalEngine } from './api';
import type { Subject, SubjectVariant } from './runner-loop';
import type { EvalEvent } from '../shared/types';

type StubInput = { q: string };
type StubOutput = { echo: string };

const stubSubject = (
  variantCount: number,
  caseCount: number,
): Subject<SubjectVariant, StubInput, StubOutput> => ({
  name: 'stub-subject',
  systemPrompt: 'stub system prompt',
  variants: Array.from({ length: variantCount }, (_, i) => ({
    name: `variant-${i}`,
    modelId: `stub-model-${i}`,
    provider: 'stub',
  })),
  cases: Array.from({ length: caseCount }, (_, i) => ({
    id: `case-id-${i}`,
    slug: `case-${i}`,
    source: 'test',
    difficulty: 'trivial' as const,
    input: { q: `q-${i}` },
    assertions: [],
  })),
  runOne: async ({ input }) => ({
    output: { echo: input.q },
    telemetry: {
      latencyMs: 1,
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      cachedInputTokens: 0,
    },
  }),
  parse: (raw) => raw as StubOutput,
  buildProviderOptions: () => undefined,
});

describe('EvalEngine event emission', () => {
  beforeEach(() => {
    closeEvalDb();
    openEvalDb(':memory:');
  });

  afterEach(() => {
    closeEvalDb();
  });

  it('emits runStarted → N×trialCompleted → runCompleted in order', async () => {
    const engine = new EvalEngine({ subject: stubSubject(2, 1) });
    const events: EvalEvent[] = [];
    engine.on((e) => events.push(e));

    await engine.run({
      trialCount: 3,
      maxConcurrency: 1,
      // cacheMode irrelevant — stubSubject.runOne ignores extraMiddlewares,
      // so the cache layer never executes regardless of the chosen mode.
      cacheMode: 'write-only',
      runId: 'run-order',
    });

    const kinds = events.map((e) => e.kind);
    expect(kinds[0]).toBe('runStarted');
    expect(kinds[kinds.length - 1]).toBe('runCompleted');
    const trialKinds = kinds.slice(1, -1);
    expect(trialKinds.every((k) => k === 'trialCompleted')).toBe(true);
    expect(trialKinds.length).toBe(2 * 1 * 3); // variants × cases × trials
  });

  it('emits one trialCompleted per (variant, case, trial) with correct payload fields', async () => {
    const engine = new EvalEngine({ subject: stubSubject(1, 2) });
    const trialEvents: Extract<EvalEvent, { kind: 'trialCompleted' }>[] = [];
    engine.on((e) => {
      if (e.kind === 'trialCompleted') trialEvents.push(e);
    });

    await engine.run({
      trialCount: 2,
      maxConcurrency: 1,
      cacheMode: 'write-only',
      runId: 'run-payload',
    });

    expect(trialEvents.length).toBe(4); // 1 × 2 × 2

    const byKey = new Set(
      trialEvents.map((e) => `${e.variantName}|${e.caseSlug}|${e.trialIndex}`),
    );
    expect(byKey.size).toBe(4); // each combination emitted exactly once
    expect(byKey.has('variant-0|case-0|0')).toBe(true);
    expect(byKey.has('variant-0|case-0|1')).toBe(true);
    expect(byKey.has('variant-0|case-1|0')).toBe(true);
    expect(byKey.has('variant-0|case-1|1')).toBe(true);

    for (const e of trialEvents) {
      expect(e.runId).toBe('run-payload');
      expect(e.trial.status).toBe('success');
    }
  });

  it('trialCompleted payloads survive JSON roundtrip', async () => {
    const engine = new EvalEngine({ subject: stubSubject(1, 1) });
    const trialEvents: Extract<EvalEvent, { kind: 'trialCompleted' }>[] = [];
    engine.on((e) => {
      if (e.kind === 'trialCompleted') trialEvents.push(e);
    });

    await engine.run({
      trialCount: 2,
      maxConcurrency: 1,
      cacheMode: 'write-only',
      runId: 'run-json',
    });

    expect(trialEvents.length).toBeGreaterThan(0);
    for (const e of trialEvents) {
      const roundtripped = JSON.parse(JSON.stringify(e));
      expect(roundtripped).toEqual(e);
    }
  });
});
