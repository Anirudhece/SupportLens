import { describe, expect, it } from 'vitest';
import {
  calculateCaseMetrics,
  diagnoseDatasetSensitivity,
  median,
  requiredFactCoverage,
  selectBestExperiment,
  summarizeExperiment,
  validateExperimentStage
} from '../src/evals/chunkingExperimentMetrics.js';

const result = (source, content) => ({ id: `${source}:0`, metadata: { source }, content });

describe('chunking experiment metrics', () => {
  it('measures source rank and required facts only within the production top four', () => {
    const testCase = {
      id: 'facts', kind: 'supported', expectedSource: 'guide.md', exactIdentifier: true,
      requiredFacts: ['PAYMENT_4027', 'expired payment method', 'retry once']
    };
    const results = [
      result('noise.md', 'Unrelated text.'),
      result('guide.md', 'PAYMENT_4027 means an expired payment method.'),
      result('other.md', 'Other context.'),
      result('other.md', 'More context.'),
      result('guide.md', 'The client should retry once.')
    ];
    const metrics = calculateCaseMetrics(testCase, results, 12.5);
    expect(metrics.expectedSourceRank).toBe(2);
    expect(metrics.hitAt3).toBe(true);
    expect(metrics.requiredFacts).toMatchObject({ covered: 2, total: 3, ratio: 2 / 3, complete: false });
    expect(metrics.requiredFacts.missing).toEqual(['retry once']);
  });

  it('returns null fact metrics when a case has no required facts', () => {
    expect(requiredFactCoverage([result('guide.md', 'answer')])).toEqual({
      covered: 0, total: 0, ratio: null, complete: null, missing: []
    });
  });

  it('selects with transparent lexicographic tie-breaking instead of a composite score', () => {
    const base = {
      cases: 1, chunkCount: 10, averageChunkTokens: 100, ingestionLatencyMs: 1, retrievalLatencyMs: 20,
      retrieval: { recallAt1: 0, recallAt3: 1, recallAt4: 1, recallAt5: 1, mrr: 1, exactIdentifierRecallAt1: 1, requiredFactCoverageAt4: 1, requiredFactCompleteAt4: 1 }, rows: []
    };
    const winner = selectBestExperiment([
      { ...base, config: { name: 'slower' }, retrievalLatencyMs: 50 },
      { ...base, config: { name: 'faster' }, retrievalLatencyMs: 10 }
    ]);
    expect(winner.config.name).toBe('faster');
  });

  it('prefers the declared control on a quality tie regardless of latency or chunk count', () => {
    const quality = { recallAt4: 1, requiredFactCompleteAt4: 1, requiredFactCoverageAt4: 1, mrr: 1, exactIdentifierRecallAt1: 1 };
    const summaries = [
      { config: { name: 'recursive-200-30' }, chunkCount: 99, retrievalLatencyMs: 900, retrieval: quality },
      { config: { name: 'recursive-100-30' }, chunkCount: 1, retrievalLatencyMs: 1, retrieval: quality }
    ];
    expect(selectBestExperiment(summaries, { preferredName: 'recursive-200-30' }).config.name).toBe('recursive-200-30');
  });

  it('calculates robust medians without mutating the input samples', () => {
    const samples = [36162.88, 10, 12];
    expect(median(samples)).toBe(12);
    expect(samples).toEqual([36162.88, 10, 12]);
    expect(median([10, 20])).toBe(15);
  });

  it('summarizes Recall@1/@3/@4/@5, MRR, exact IDs, facts, size, and latency', () => {
    const testCase = { id: 'one', kind: 'supported', expectedSource: 'guide.md', exactIdentifier: true, requiredFacts: ['answer'] };
    const row = calculateCaseMetrics(testCase, [result('guide.md', 'answer')], 12, [10, 12, 36162.88]);
    const summary = summarizeExperiment({
      config: { name: 'recursive-200-30' }, cases: [testCase], chunkCount: 1,
      tokenCounts: [9], ingestionLatencyMs: 3, rows: [row]
    });
    expect(summary.retrieval).toMatchObject({
      recallAt1: 1, recallAt3: 1, recallAt4: 1, recallAt5: 1, mrr: 1,
      exactIdentifierRecallAt1: 1, requiredFactCoverageAt4: 1, requiredFactCompleteAt4: 1
    });
    expect(summary.averageChunkTokens).toBe(9);
    expect(summary.retrievalLatencyMs).toBe(12);
    expect(summary.retrievalLatencyMeanMs).toBeCloseTo((10 + 12 + 36162.88) / 3);
    expect(summary.retrievalLatencySamplesMs).toEqual([10, 12, 36162.88]);
  });

  it('warns when a stage has identical layouts and quality metrics', () => {
    const makeSummary = (name) => ({
      config: { name }, layoutFingerprint: 'same', chunkCount: 8,
      retrieval: { recallAt4: 1, requiredFactCompleteAt4: 1, requiredFactCoverageAt4: 1, mrr: 1, exactIdentifierRecallAt1: 1 }
    });
    const diagnostic = diagnoseDatasetSensitivity([makeSummary('a'), makeSummary('b')]);
    expect(diagnostic).toMatchObject({
      distinctLayouts: 1, distinctChunkCounts: [8], factCoverageValuesAt4: [1],
      factCoverageVaries: false, nonDiscriminating: true
    });
    expect(diagnostic.warning).toMatch(/non-discriminating/);
  });

  it('fails closed when any planned configuration has an error', () => {
    const planned = [{ name: 'recursive-100-30' }, { name: 'recursive-200-30' }];
    const summaries = [
      { config: { name: 'recursive-100-30' } },
      { config: { name: 'recursive-200-30' }, error: 'collection_failed' }
    ];
    expect(() => validateExperimentStage('Stage 1', planned, summaries)).toThrow(
      'Stage 1 failed; no selection or recommendation is valid'
    );
  });
});
