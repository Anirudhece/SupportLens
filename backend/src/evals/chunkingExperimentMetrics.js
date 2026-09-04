function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function expectedSourceRank(results, expectedSource) {
  if (!expectedSource) return null;
  const index = results.findIndex((result) => result.metadata?.source === expectedSource);
  return index === -1 ? null : index + 1;
}

export function requiredFactCoverage(results, requiredFacts = [], topK = 4) {
  if (!requiredFacts.length) return { covered: 0, total: 0, ratio: null, complete: null, missing: [] };
  const context = normalize(results.slice(0, topK).map((result) => result.content).join(' '));
  const coveredFacts = requiredFacts.filter((fact) => context.includes(normalize(fact)));
  const missing = requiredFacts.filter((fact) => !context.includes(normalize(fact)));
  return {
    covered: coveredFacts.length,
    total: requiredFacts.length,
    ratio: coveredFacts.length / requiredFacts.length,
    complete: coveredFacts.length === requiredFacts.length,
    missing
  };
}

export function calculateCaseMetrics(testCase, results, retrievalLatencyMs, retrievalLatencySamplesMs = []) {
  const rank = expectedSourceRank(results, testCase.expectedSource);
  const coverage = requiredFactCoverage(results, testCase.requiredFacts, 4);
  return {
    id: testCase.id,
    kind: testCase.kind,
    exactIdentifier: Boolean(testCase.exactIdentifier),
    expectedSource: testCase.expectedSource || null,
    expectedSourceRank: rank,
    hitAt1: rank === 1,
    hitAt3: rank !== null && rank <= 3,
    hitAt4: rank !== null && rank <= 4,
    hitAt5: rank !== null && rank <= 5,
    reciprocalRank: rank ? 1 / rank : 0,
    requiredFacts: coverage,
    retrievalLatencyMs,
    retrievalLatencyMedianMs: median(retrievalLatencySamplesMs) ?? retrievalLatencyMs,
    retrievalLatencyMeanMs: mean(retrievalLatencySamplesMs) ?? retrievalLatencyMs,
    retrievalLatencySamplesMs
  };
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function ratio(rows, predicate) {
  return rows.length ? rows.filter(predicate).length / rows.length : null;
}

export function summarizeExperiment({ config, cases, chunkCount, tokenCounts, layoutFingerprint, ingestionLatencyMs, rows }) {
  const sourceRows = rows.filter((row) => row.expectedSource);
  const exactRows = sourceRows.filter((row) => row.exactIdentifier);
  const factRows = rows.filter((row) => row.requiredFacts.total > 0);
  return {
    config,
    cases: cases.length,
    chunkCount,
    averageChunkTokens: mean(tokenCounts),
    layoutFingerprint,
    ingestionLatencyMs,
    retrievalLatencyMs: median(rows.map((row) => row.retrievalLatencyMedianMs).filter(Number.isFinite)),
    retrievalLatencyMedianMs: median(rows.map((row) => row.retrievalLatencyMedianMs).filter(Number.isFinite)),
    retrievalLatencyMeanMs: mean(rows.map((row) => row.retrievalLatencyMeanMs).filter(Number.isFinite)),
    retrievalLatencySamplesMs: rows.flatMap((row) => row.retrievalLatencySamplesMs || []),
    retrieval: {
      recallAt1: ratio(sourceRows, (row) => row.hitAt1),
      recallAt3: ratio(sourceRows, (row) => row.hitAt3),
      recallAt4: ratio(sourceRows, (row) => row.hitAt4),
      recallAt5: ratio(sourceRows, (row) => row.hitAt5),
      mrr: mean(sourceRows.map((row) => row.reciprocalRank)),
      exactIdentifierRecallAt1: ratio(exactRows, (row) => row.hitAt1),
      requiredFactCoverageAt4: mean(factRows.map((row) => row.requiredFacts.ratio)),
      requiredFactCompleteAt4: ratio(factRows, (row) => row.requiredFacts.complete)
    },
    rows
  };
}

function compareMetric(left, right, field) {
  const a = left.retrieval[field] ?? -1;
  const b = right.retrieval[field] ?? -1;
  return b - a;
}

// Selection is lexicographic and intentionally not a composite score. The
// order makes the production top-four contract and complete facts primary;
// later fields only break a tie and are printed by the runner.
export function compareExperimentSummaries(left, right, { preferredName } = {}) {
  for (const field of ['recallAt4', 'requiredFactCompleteAt4', 'requiredFactCoverageAt4', 'mrr', 'exactIdentifierRecallAt1']) {
    const difference = compareMetric(left, right, field);
    if (difference !== 0) return difference;
  }
  // Latency, chunk count, and ingestion cost remain descriptive evidence. They
  // must not choose a production candidate when quality metrics tie.
  if (preferredName) {
    if (left.config.name === preferredName && right.config.name !== preferredName) return -1;
    if (right.config.name === preferredName && left.config.name !== preferredName) return 1;
  }
  return String(left.config.name).localeCompare(String(right.config.name));
}

export function selectBestExperiment(summaries, options = {}) {
  if (!summaries.length) return null;
  return summaries.slice().sort((left, right) => compareExperimentSummaries(left, right, options))[0];
}

export function diagnoseDatasetSensitivity(summaries) {
  const valid = summaries.filter((summary) => !summary.error);
  const layouts = [...new Set(valid.map((summary) => summary.layoutFingerprint).filter(Boolean))];
  const chunkCounts = [...new Set(valid.map((summary) => summary.chunkCount))];
  const factCoverage = [...new Set(valid
    .map((summary) => summary.retrieval.requiredFactCoverageAt4)
    .filter((value) => value !== null && value !== undefined))];
  const qualitySignatures = [...new Set(valid.map((summary) => JSON.stringify([
    summary.retrieval.recallAt4,
    summary.retrieval.requiredFactCompleteAt4,
    summary.retrieval.requiredFactCoverageAt4,
    summary.retrieval.mrr,
    summary.retrieval.exactIdentifierRecallAt1
  ])))];
  const nonDiscriminating = valid.length > 1 && layouts.length <= 1 && qualitySignatures.length <= 1;
  return {
    comparedConfigurations: valid.length,
    distinctLayouts: layouts.length,
    distinctChunkCounts: chunkCounts,
    factCoverageValuesAt4: factCoverage,
    factCoverageVaries: factCoverage.length > 1,
    nonDiscriminating,
    warning: nonDiscriminating
      ? 'Dataset is non-discriminating for this stage: compared layouts and quality metrics are identical.'
      : null
  };
}

export function validateExperimentStage(stageName, plannedExperiments, summaries) {
  const failures = plannedExperiments.map((experiment) => {
    const summary = summaries.find((candidate) => candidate.config?.name === experiment.name);
    return summary?.error ? `${experiment.name} (${summary.error})` : summary ? null : `${experiment.name} (missing result)`;
  }).filter(Boolean);
  if (failures.length) {
    throw new Error(`${stageName} failed; no selection or recommendation is valid. Failed configurations: ${failures.join(', ')}`);
  }
  return summaries;
}
