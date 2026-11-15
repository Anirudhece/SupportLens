import { describe, expect, it } from 'vitest';
import { RETRIEVAL_EXPERIMENT_DEPTHS, aggregateFilterAudit, auditCaseResults, describeUnsupportedBehavior, stageEvidence, whereFor } from '../src/evals/retrievalExperimentMetrics.js';
import { termsFrom } from '../src/services/retrievalService.js';

describe('retrieval experiment helpers', () => {
  it('extracts identifier terms first and reports actual channel depths', () => {
    expect(termsFrom('Please explain PAYMENT_4027 after a billing upgrade')[0]).toBe('PAYMENT_4027');
    expect(RETRIEVAL_EXPERIMENT_DEPTHS.hybrid).toMatchObject({ vectorCandidateDepth: 25, keywordCandidateDepth: 20, fusedCandidateDepth: 25 });
  });
  it('builds Chroma AND filters and audits returned metadata', () => {
    const filters = { product: 'billing', documentVersion: 'v2' };
    expect(whereFor(filters)).toEqual({ $and: [{ product: 'billing' }, { documentVersion: 'v2' }] });
    const audit = auditCaseResults({ filters }, [{ id: 'a', metadata: { product: 'billing', documentVersion: 'v2' } }, { id: 'b', metadata: { product: 'billing', documentVersion: 'v1' } }]);
    expect(audit).toMatchObject({ returnedCount: 2, everyResultSatisfiesFilter: false, expectedFilters: filters });
  });
  it('records filtered-empty counts and keeps unsupported cases descriptive', () => {
    const row = { id: 'empty', filterAudit: auditCaseResults({ filters: { product: 'shipping' } }, []) };
    expect(aggregateFilterAudit([row])).toMatchObject({ casesWithFilters: 1, allReturnedResultsMatchFilters: true, filteredEmptyCases: [{ caseId: 'empty', observedResultCount: 0 }] });
    expect(describeUnsupportedBehavior({ kind: 'adversarial' }, [{ metadata: { source: 'security-test-instructions.md' } }])).toMatchObject({ returnedCount: 1, treatedAsRecall: false });
  });
  it('serializes stage candidates with ranking evidence', () => {
    expect(stageEvidence({ fused: [{ id: 'x', metadata: { source: 'guide.md' }, vectorRank: 2, keywordRank: 1, fusionScore: .03 }] })).toEqual({ fused: [{ id: 'x', source: 'guide.md', metadata: { source: 'guide.md' }, vectorRank: 2, keywordRank: 1, rerankRank: null, fusionScore: .03, rerankScore: null }] });
  });
});
