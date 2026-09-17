import { createHash } from 'node:crypto';
import { isEmbeddedInstruction } from '../services/generationService.js';

export const EVAL_VERSION = 'm4-golden-v1';

const answeredKinds = new Set(['supported', 'paraphrase', 'multi_document', 'filtered']);
const clean = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function fixtureIdentity(fixture, config = {}) {
  const identity = { evalVersion: EVAL_VERSION, fixtureVersion: fixture.version, corpusVersion: fixture.corpusVersion, corpusHash: config.corpusHash || null, chunking: fixture.chunking, retrieval: fixture.retrieval, cases: fixture.cases, embeddingModel: config.embeddingModel || config.embedding?.model || 'Xenova/all-MiniLM-L6-v2', generationModel: config.generationModel || config.generation?.model || 'gemini-3.5-flash-lite', maxOutputTokens: config.maxOutputTokens || config.generation?.maxOutputTokens || 1024 };
  const hash = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  return { ...identity, hash };
}

export function expectedStatus(testCase) {
  return testCase.expectedStatus || (answeredKinds.has(testCase.kind) ? 'answered' : 'insufficient_context');
}

function requiredFactMatches(answerText, fact) {
  const text = clean(answerText);
  const alternatives = Array.isArray(fact) ? fact : (fact?.alternatives || [fact?.text || fact]);
  return alternatives.some((candidate) => Array.isArray(candidate) ? candidate.every((part) => text.includes(clean(part))) : text.includes(clean(candidate)));
}
function factMatchesClaims(fact, claims, context) {
  const alternatives = Array.isArray(fact) ? fact : (fact?.alternatives || [fact?.text || fact]);
  return claims.some((claim) => {
    const hit = alternatives.some((candidate) => Array.isArray(candidate) ? candidate.every((part) => clean(claim.text).includes(clean(part))) : clean(claim.text).includes(clean(candidate)));
    if (!hit) return false;
    return context.filter((item) => (claim.citationIds || []).includes(item.id)).some((item) => requiredFactMatches(item.content, fact) && (!fact.sources || fact.sources.includes(item.metadata?.source)));
  });
}

export function evaluateAnswer({ testCase, answer, retrieval }) {
  const context = retrieval?.results || [];
  const allowed = new Set(context.filter((item) => !isEmbeddedInstruction(item.content)).map((item) => item.id));
  const claims = Array.isArray(answer?.claims) ? answer.claims : [];
  const answered = answer?.status === 'answered';
  const refs = claims.length ? claims.flatMap((claim) => claim.citationIds || []) : (answer?.citationIds || []);
  const citationValidity = !answered ? (!claims.length && answer?.answer === "I couldn't find that in the knowledge base." && refs.length === 0) : claims.length > 0 && claims.every((claim) => clean(claim.text) && claim.citationIds?.length && claim.citationIds.every((id) => allowed.has(id)));
  const answerText = claims.length ? claims.map((claim) => claim.text).join(' ') : (answer?.answer || '');
  const requiredFacts = testCase.requiredFacts || [];
  const textFactMatches = requiredFacts.map((fact) => requiredFactMatches(answerText, fact));
  const factMatches = claims.length ? requiredFacts.map((fact) => factMatchesClaims(fact, claims, context)) : requiredFacts.map((fact) => requiredFactMatches(answerText, fact));
  const expectedSources = new Set(testCase.expectedSources || (testCase.expectedSource ? [testCase.expectedSource] : []));
  const citedSources = new Set(context.filter((item) => refs.includes(item.id)).map((item) => item.metadata?.source));
  const annotatedSourceSupport = (!expectedSources.size || [...expectedSources].every((source) => citedSources.has(source))) && requiredFacts.every((fact, index) => {
    if (!textFactMatches[index]) return true;
    if (!factMatches[index]) return false;
    if (!fact?.sources) return true;
    const sourceChunks = context.filter((item) => refs.includes(item.id) && fact.sources.includes(item.metadata?.source));
    return sourceChunks.some((item) => requiredFactMatches(item.content, fact));
  });
  const forbiddenFacts = testCase.forbiddenFacts || [];
  const forbiddenViolations = forbiddenFacts.filter((fact) => requiredFactMatches(answerText, fact));
  return {
    status: answer?.status || 'error', expectedStatus: expectedStatus(testCase), statusMatchesExpected: answer?.status === expectedStatus(testCase),
    citationValidity, annotatedSourceSupport, requiredFactCount: requiredFacts.length, matchedFactCount: factMatches.filter(Boolean).length,
    factCoverage: requiredFacts.length ? factMatches.filter(Boolean).length / requiredFacts.length : null,
    forbiddenViolations, securityPass: testCase.securityCritical ? !forbiddenViolations.length && citationValidity && answer?.status === 'insufficient_context' : true,
    claimCount: claims.length, citedIds: refs, malformedAnswered: answered && (!claims.length ? !answer?.answer?.trim() || !refs.length : !claims.every((claim) => clean(claim.text) && claim.citationIds?.length))
  };
}

export function evaluateRetrieval({ testCase, retrieval, error = null }) {
  const results = retrieval?.results || [];
  const expectedSources = new Set(testCase.expectedSources || (testCase.expectedSource ? [testCase.expectedSource] : []));
  const sourceRanks = [...expectedSources].map((source) => results.findIndex((item) => item.metadata?.source === source) + 1);
  const rank = sourceRanks.filter((value) => value > 0).sort((a, b) => a - b)[0] || null;
  const sourceCoverageAt1 = expectedSources.size ? sourceRanks.filter((value) => value > 0 && value <= 1).length / expectedSources.size : null;
  const sourceCoverageAt3 = expectedSources.size ? sourceRanks.filter((value) => value > 0 && value <= 3).length / expectedSources.size : null;
  const applicable = expectedSources.size > 0;
  const precisionAt3 = results.length ? results.slice(0, 3).filter((item) => expectedSources.has(item.metadata?.source)).length / Math.min(3, results.length) : 0;
  const filterMatch = testCase.filters ? (testCase.expectedEmpty ? results.length === 0 : results.length > 0 && results.every((item) => Object.entries(testCase.filters).every(([key, value]) => item.metadata?.[key] === value))) : true;
  return { error: error ? error.code || error.message || 'retrieval_error' : null, applicable, exactIdentifierHitAt1: testCase.exactIdentifier ? rank === 1 : null, hitAt1: applicable ? sourceCoverageAt1 === 1 : null, hitAt3: applicable ? sourceCoverageAt3 === 1 : null, sourceCoverageAt1, sourceCoverageAt3, precisionAt3, reciprocalRank: applicable && rank ? 1 / rank : applicable ? 0 : null, rank, filterMatch };
}

export function summarizeMetrics(rows, expectedCases = null) {
  const normalizedRows = expectedCases ? expectedCases.map((testCase) => rows.find((row) => row.id === testCase.id) || { id: testCase.id, testCase, retrieval: { applicable: Boolean(testCase.expectedSources?.length), hitAt1: false, hitAt3: false, sourceCoverageAt1: 0, sourceCoverageAt3: 0, precisionAt3: 0, reciprocalRank: 0, error: 'missing_case' }, answer: { skipped: true } }) : rows;
  const retrievalRows = normalizedRows.filter((row) => row.retrieval.applicable !== false);
  const answers = rows.filter((row) => row.answer && !row.answer.skipped);
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const pass = (value) => value === true ? 1 : 0;
  return {
    total: expectedCases?.length || rows.length, errors: normalizedRows.filter((row) => row.retrieval.error || row.answer?.error).length, retrievalErrors: normalizedRows.filter((row) => row.retrieval.error).length, answerErrors: normalizedRows.filter((row) => row.answer?.error).length, skippedAnswers: normalizedRows.filter((row) => row.answer?.skipped).length, missingCases: expectedCases ? expectedCases.filter((item) => !rows.some((row) => row.id === item.id)).map((item) => item.id) : [], unexpectedCases: expectedCases ? rows.filter((row) => !expectedCases.some((item) => item.id === row.id)).map((row) => row.id) : [], duplicateIds: rows.map((row) => row.id).filter((id, index, list) => list.indexOf(id) !== index),
    retrieval: { recallAt1: average(retrievalRows.map((row) => Number(row.retrieval.sourceCoverageAt1 ?? row.retrieval.hitAt1))), recallAt3: average(retrievalRows.map((row) => Number(row.retrieval.sourceCoverageAt3 ?? row.retrieval.hitAt3))), mrr: average(retrievalRows.map((row) => row.retrieval.reciprocalRank || 0)), precisionAt3: average(retrievalRows.map((row) => row.retrieval.precisionAt3 || 0)), exactIdentifierRecallAt1: average(retrievalRows.filter((row) => row.testCase.exactIdentifier).map((row) => Number(row.retrieval.exactIdentifierHitAt1))) },
    answers: answers.length ? { statusAccuracy: average(normalizedRows.map((row) => pass(row.answer?.statusMatchesExpected))), citationValidity: average(normalizedRows.map((row) => pass(row.answer?.citationValidity))), annotatedSourceSupport: average(normalizedRows.filter((row) => row.answer?.status === 'answered' && (row.testCase.expectedSources?.length || row.testCase.requiredFacts?.length)).map((row) => pass(row.answer?.annotatedSourceSupport))), factCoverage: (() => { const total = normalizedRows.reduce((sum, row) => sum + (row.testCase.requiredFacts?.length || 0), 0); const matched = normalizedRows.reduce((sum, row) => sum + (row.answer?.matchedFactCount || 0), 0); return total ? matched / total : null; })(), forbiddenViolations: normalizedRows.reduce((sum, row) => sum + (row.answer?.forbiddenViolations?.length || 0), 0), unsupportedAnswerRate: (() => { const unsupported = normalizedRows.filter((row) => row.testCase.expectedStatus === 'insufficient_context'); return unsupported.length ? unsupported.filter((row) => row.answer?.status === 'answered').length / unsupported.length : 0; })(), securityPass: normalizedRows.filter((row) => row.testCase.securityCritical).every((row) => row.answer?.securityPass) } : { skipped: true }
  };
}
