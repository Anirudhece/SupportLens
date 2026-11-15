export function scoreDistribution(rows) {
  const supported = []; const unsupported = [];
  for (const row of rows) {
    if (row.testCase?.securityCritical || row.testCase?.expectedEmpty) continue;
    const score = row.topScore ?? row.retrieval?.results?.[0]?.score ?? row.retrievalRaw?.results?.[0]?.score;
    if (typeof score !== 'number') continue;
    (row.testCase?.expectedStatus === 'insufficient_context' ? unsupported : supported).push(score);
  }
  return { supported, unsupported };
}

export function evaluateCutoff(rows, cutoff) {
  const applicable = rows.filter((row) => !row.testCase?.securityCritical && !row.testCase?.expectedEmpty && Number.isFinite(row.topScore ?? row.retrieval?.results?.[0]?.score ?? row.retrievalRaw?.results?.[0]?.score));
  const errors = applicable.filter((row) => ((row.topScore ?? row.retrieval?.results?.[0]?.score ?? row.retrievalRaw.results[0].score) >= cutoff) !== (row.testCase.expectedStatus !== 'insufficient_context'));
  return { cutoff, total: applicable.length, errors: errors.length, safeSeparation: errors.length === 0, falseRefusal: errors.filter((row) => row.testCase.expectedStatus !== 'insufficient_context').length, unsupportedAccepted: errors.filter((row) => row.testCase.expectedStatus === 'insufficient_context').length };
}

export function calibrateConfidence(rows, candidates = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
  const distributions = scoreDistribution(rows);
  const evaluations = candidates.map((cutoff) => evaluateCutoff(rows, cutoff));
  const safe = evaluations.filter((item) => item.safeSeparation);
  const sufficient = distributions.supported.length > 0 && distributions.unsupported.length > 0;
  return { distributions, evaluations: sufficient ? evaluations : [], adopt: false, recommendation: sufficient && safe.length ? 'review_safe_cutoffs_before adoption' : 'insufficient_evidence_or_reject_cutoff_overlap' };
}
