export const RETRIEVAL_EXPERIMENT_DEPTHS = Object.freeze({
  vector: { channelCandidateDepth: 5, finalDepth: 5 },
  keyword: { channelCandidateDepth: 20, finalDepth: 5 },
  hybrid: { vectorCandidateDepth: 25, keywordCandidateDepth: 20, fusedCandidateDepth: 25, finalDepth: 5, rrfK: 60 },
  reranked: { vectorCandidateDepth: 25, keywordCandidateDepth: 20, fusedCandidateDepth: 25, rerankCandidateDepth: 20, finalDepth: 5, rrfK: 60 }
});

export function whereFor(filters = {}) {
  const entries = Object.entries(filters);
  return entries.length === 0 ? undefined : entries.length === 1 ? filters : { $and: entries.map(([key, value]) => ({ [key]: value })) };
}

export function metadataMatchesFilters(metadata = {}, filters = {}) {
  return Object.entries(filters).every(([key, value]) => metadata[key] === value);
}

export function auditCaseResults(testCase, results = []) {
  const filters = testCase.filters || {};
  const evidence = results.map((result) => ({
    id: result.id,
    source: result.metadata?.source || null,
    metadata: result.metadata || {},
    score: result.score ?? null,
    distance: result.distance ?? null,
    vectorRank: result.vectorRank ?? null,
    keywordRank: result.keywordRank ?? null,
    rerankRank: result.rerankRank ?? null
  }));
  return {
    expectedFilters: filters,
    returnedCount: results.length,
    returnedIds: evidence.map((item) => item.id),
    evidence,
    everyResultSatisfiesFilter: results.every((result) => metadataMatchesFilters(result.metadata, filters)),
    filteredEmptyObserved: Object.keys(filters).length > 0 && results.length === 0
  };
}

export function aggregateFilterAudit(rows) {
  const filterRows = rows.filter((row) => Object.keys(row.filterAudit?.expectedFilters || {}).length > 0);
  return {
    casesWithFilters: filterRows.length,
    allReturnedResultsMatchFilters: filterRows.every((row) => row.filterAudit.everyResultSatisfiesFilter),
    filteredEmptyCases: filterRows.filter((row) => row.filterAudit.filteredEmptyObserved).map((row) => ({ caseId: row.id, observedResultCount: row.filterAudit.returnedCount }))
  };
}

export function describeUnsupportedBehavior(testCase, results) {
  if (!['unsupported', 'adversarial'].includes(testCase.kind)) return null;
  return { kind: testCase.kind, returnedCount: results.length, returnedSources: results.map((result) => result.metadata?.source || null), treatedAsRecall: false };
}

export function stageEvidence(stages = {}) {
  return Object.fromEntries(Object.entries(stages).map(([name, results]) => [name, results.map((result) => ({
    id: result.id,
    source: result.metadata?.source || null,
    metadata: result.metadata || {},
    vectorRank: result.vectorRank ?? null,
    keywordRank: result.keywordRank ?? null,
    rerankRank: result.rerankRank ?? null,
    fusionScore: result.fusionScore ?? null,
    rerankScore: result.rerankScore ?? null
  }))]));
}
