import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixtureIdentity, summarizeMetrics } from './trustMetrics.js';
import { calibrateConfidence } from './confidenceCalibration.js';

export const REQUIRED_GATES = { citationValidity: 1, securityPass: 1, filterCorrectness: 1, recallAt3: 0.9, mrr: 0.8, factCoverage: 0.85 };

export function buildReport({ fixture, config, rows, mode = 'retrieval-only', skipped = [] }) {
  const metrics = summarizeMetrics(rows, fixture.cases);
  const filterRows = rows.filter((row) => row.testCase.filters);
  const identity = fixtureIdentity(fixture, config);
  const gates = {
    citationValidity: metrics.answers.skipped ? null : metrics.answers.citationValidity,
    securityPass: metrics.answers.skipped ? null : Number(metrics.answers.securityPass),
    filterCorrectness: filterRows.length ? Number(filterRows.every((row) => row.retrieval.filterMatch && !row.retrieval.error)) : null,
    recallAt3: metrics.retrieval.recallAt3,
    mrr: metrics.retrieval.mrr,
    factCoverage: metrics.answers.skipped ? null : metrics.answers.factCoverage
  };
  return { runId: randomUUID(), reportVersion: 'm4-report-v1', generatedAt: new Date().toISOString(), identity, mode, reviewStatus: fixture.reviewStatus, metrics, confidenceCalibration: calibrateConfidence(rows), gates, skipped, rows, failures: [] };
}

export function compareBaseline(report, baseline) {
  if (!baseline) return { comparable: false, reason: 'baseline_missing', regressions: ['accepted baseline is required'] };
  if (baseline.accepted !== true || baseline.reviewStatus !== 'accepted') return { comparable: false, reason: 'baseline_not_accepted', regressions: ['baseline must be explicitly accepted after review'] };
  if (baseline.mode !== 'live' || baseline.skipped?.length || baseline.metrics?.errors || !Number.isFinite(baseline.metrics?.retrieval?.recallAt3) || !Number.isFinite(baseline.metrics?.retrieval?.mrr) || !Number.isFinite(baseline.metrics?.answers?.factCoverage)) return { comparable: false, reason: 'baseline_incomplete', regressions: ['baseline must be a complete passing live run with finite required metrics'] };
  if (baseline.identity?.hash !== report.identity.hash) return { comparable: false, reason: 'baseline_incompatible', regressions: ['fixture/config identity hash differs'] };
  const ids = report.rows.map((row) => row.id);
  const baselineIds = baseline.rows?.map((row) => row.id) || [];
  if (new Set(ids).size !== ids.length || ids.some((id) => !baselineIds.includes(id)) || baselineIds.some((id) => !ids.includes(id)) || baselineIds.length !== ids.length) return { comparable: false, reason: 'baseline_row_set_mismatch', regressions: ['baseline and candidate must contain the same unique case rows'] };
  for (const key of Object.keys(REQUIRED_GATES)) if (!Number.isFinite(baseline.gates?.[key])) return { comparable: false, reason: 'baseline_missing_gate', regressions: [`baseline gate ${key} is missing or non-finite`] };
  const regressions = [];
  for (const key of ['recallAt3', 'mrr', 'factCoverage', 'citationValidity', 'annotatedSourceSupport', 'statusAccuracy', 'unsupportedAnswerRate']) {
    const current = report.gates[key]; const previous = baseline.gates?.[key];
    const currentValue = current ?? report.metrics.answers?.[key]; const previousValue = previous ?? baseline.metrics?.answers?.[key];
    if (typeof currentValue === 'number' && typeof previousValue === 'number' && (key === 'unsupportedAnswerRate' ? currentValue > previousValue : currentValue < previousValue)) regressions.push(`${key} regressed from ${previousValue} to ${currentValue}`);
  }
  if ((report.metrics.answers?.forbiddenViolations || 0) > (baseline.metrics?.answers?.forbiddenViolations || 0)) regressions.push('forbidden fact violations increased');
  return { comparable: true, regressions };
}

export function gateFailures(report, comparison) {
  const failures = Object.entries(REQUIRED_GATES).filter(([key, threshold]) => !Number.isFinite(report.gates[key]) || report.gates[key] < threshold).map(([key, threshold]) => `${key} below required ${threshold}`);
  if (report.metrics.retrievalErrors ?? report.metrics.errors) failures.push(`${report.metrics.retrievalErrors ?? report.metrics.errors} retrieval errors present`);
  if (report.metrics.answerErrors) failures.push(`${report.metrics.answerErrors} answer errors present`);
  if (report.skipped?.length || report.metrics.skippedAnswers) failures.push(`${report.skipped?.length || report.metrics.skippedAnswers} answer checks skipped`);
  if (report.reviewStatus !== 'accepted') failures.push('fixture annotations are not accepted (draft review status)');
  if (report.metrics.missingCases?.length || report.metrics.unexpectedCases?.length || report.metrics.duplicateIds?.length) failures.push('missing, unexpected, or duplicate case rows');
  if ((report.metrics.answers?.forbiddenViolations || 0) > 0) failures.push('forbidden fact violations present');
  if ((report.metrics.answers?.unsupportedAnswerRate || 0) > 0) failures.push('unsupported-answer rate is nonzero');
  if (report.rows.some((row) => row.answer?.status === 'answered' && (row.testCase.expectedSources?.length || row.testCase.requiredFacts?.length) && row.answer.annotatedSourceSupport === false)) failures.push('annotated fact/source support failure');
  if (!comparison.comparable || comparison.regressions.length) failures.push(...comparison.regressions);
  return [...new Set(failures)];
}

export async function writeReports(report, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const runId = report.runId || report.generatedAt.replace(/[^0-9]/g, '').slice(0, 14);
  const jsonPath = path.join(outputDir, `m4-regression-${runId}.json`);
  const mdPath = path.join(outputDir, `m4-regression-${runId}.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(mdPath, `# SupportLens M4 evaluation\n\n- Identity: \`${report.identity.hash}\`\n- Status: ${report.reviewStatus}\n- Mode: ${report.mode}\n\n## Gates\n\n${Object.entries(report.gates).map(([key, value]) => `- ${key}: ${value ?? 'skipped'}`).join('\n')}\n\n## Failures and skipped checks\n\n${(report.failures || report.skipped || []).map((item) => `- ${typeof item === 'string' ? item : item.id || JSON.stringify(item)}`).join('\n') || '- none recorded'}\n\n## Case evidence\n\n${report.rows.map((row) => `- ${row.id}: retrieval=${row.retrieval.error || `R@3=${row.retrieval.hitAt3}`} answer=${row.answer?.error || row.answer?.status || (row.answer?.skipped ? `skipped (${row.answer.reason})` : 'n/a')} facts=${row.answer?.factCoverage ?? 'n/a'} citations=${row.answer?.citationValidity ?? 'n/a'}`).join('\n')}\n`);
  return { jsonPath, mdPath };
}

export async function loadBaseline(filePath) { return JSON.parse(await readFile(filePath, 'utf8')); }
