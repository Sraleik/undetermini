/**
 * Cases for the EXAMPLE sentiment subject. Kept as a plain inline array (no
 * directory auto-discovery) because there are only a handful — the smallest
 * thing that teaches the shape. For a real subject with many cases, mirror the
 * talent auto-discovery in `core/.../nl-filter-cases/index.ts` instead.
 *
 * A case = an input + the assertions its output must satisfy. Assertions are
 * semantic predicates over TOutput (here: the `Sentiment` label). `category` is
 * a free display label now that `AssertionCategory` is an open union — 'SENTIMENT'
 * is not a talent category, which is the whole point.
 */
import { defineCase } from '@eval/engine/types';
import type { Sentiment } from './sentiment.subject';

const is = (expected: Sentiment) => (o: Sentiment): boolean => o === expected;

export const exampleSentimentCases = [
  defineCase<string, Sentiment>({
    id: '98df6f2f-5a0c-40e6-8d62-4b58b1cc4662',
    slug: 'clearly-positive',
    source: 'MANUAL',
    difficulty: 'trivial',
    input: 'I absolutely love this product, it changed my life!',
    assertions: [
      {
        id: '6401e163-e037-4f53-80f4-64e98be1d341',
        version: 1,
        category: 'SENTIMENT',
        name: 'classified as positive',
        check: is('positive'),
      },
    ],
  }),
  defineCase<string, Sentiment>({
    id: '8766fdd7-9ff9-4c6a-a292-4e3e9341dfe7',
    slug: 'clearly-negative',
    source: 'MANUAL',
    difficulty: 'trivial',
    input: 'This is the worst experience I have ever had. Terrible.',
    assertions: [
      {
        id: '323106da-9ec1-4575-8159-ea8539e146db',
        version: 1,
        category: 'SENTIMENT',
        name: 'classified as negative',
        check: is('negative'),
      },
    ],
  }),
  defineCase<string, Sentiment>({
    id: 'dbc52305-dba1-49e8-bdfb-71570ee407c6',
    slug: 'neutral-statement',
    source: 'MANUAL',
    difficulty: 'easy',
    input: 'The meeting is scheduled for 3pm in room B.',
    assertions: [
      {
        id: '8aaf6cf6-8f4a-48e3-b50e-4493f0ec64eb',
        version: 1,
        category: 'SENTIMENT',
        name: 'classified as neutral',
        check: is('neutral'),
      },
    ],
  }),
];
