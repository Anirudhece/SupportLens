import { readFile } from 'node:fs/promises';
import { loadConfig } from '../src/config/environment.js';
import { createChromaClients } from '../src/clients/chromaClients.js';
import { createChromaRepository } from '../src/repositories/chromaRepository.js';
import { createLocalEmbeddingProvider } from '../src/embedding/localMiniLm.js';
import { createDocumentRegistry } from '../src/services/documentRegistry.js';
import { createRetrievalService } from '../src/services/retrievalService.js';
import { createGenerationService } from '../src/services/generationService.js';

const config = loadConfig();
const target = process.argv[2] || 'local';
const cases = JSON.parse(await readFile(new URL('../evals/seed-cases.json', import.meta.url), 'utf8'));
const clients = createChromaClients(config);
const registry = createDocumentRegistry({ path: config.storage.registryPath });
const retrieval = createRetrievalService({ config, embeddings: createLocalEmbeddingProvider({ model: config.embedding.model }), repository: createChromaRepository({ clients, registry }) });
const generation = config.generation.apiKey ? createGenerationService({ config }) : null;
const rows = [];
for (const testCase of cases) {
  const started = performance.now();
  try {
    const result = await retrieval.retrieve({ question: testCase.question, target });
    const rank = testCase.expectedSource
      ? result.results.findIndex((item) => item.metadata.source === testCase.expectedSource) + 1
      : null;
    const retrievalLatencyMs = result.latencyMs;
    const answerStarted = performance.now();
    const answer = generation ? await generation.answer({ question: testCase.question, results: result.results }) : null;
    rows.push({
      id: testCase.id,
      kind: testCase.kind,
      exactIdentifier: Boolean(testCase.exactIdentifier),
      topSource: result.results[0]?.metadata?.source || null,
      rank: rank || null,
      hitAt1: rank === 1,
      hitAt3: rank > 0 && rank <= 3,
      reciprocalRank: rank > 0 ? 1 / rank : 0,
      latencyMs: retrievalLatencyMs,
      answer: generation ? {
        status: answer.status,
        citationValid: answer.citationIds.every((id) => result.results.some((item) => item.id === id)),
        fallback: answer.status === 'insufficient_context',
        expectedStatus: ['supported', 'paraphrase'].includes(testCase.kind) ? 'answered' : 'insufficient_context',
        statusMatchesExpected: answer.status === (['supported', 'paraphrase'].includes(testCase.kind) ? 'answered' : 'insufficient_context'),
        usage: answer.usage,
        latencyMs: Math.round((performance.now() - answerStarted) * 100) / 100
      } : { skipped: true, reason: 'GEMINI_API_KEY is not configured.' }
    });
  } catch (error) { rows.push({ id: testCase.id, kind: testCase.kind, error: error.code || 'retrieval_failed' }); }
}
const retrieved = rows.filter((row) => !row.error);
const supported = retrieved.filter((row) => ['supported', 'paraphrase'].includes(row.kind));
const exactIdentifier = retrieved.filter((row) => row.exactIdentifier);
const answerRows = retrieved.map((row) => row.answer).filter((answer) => !answer.skipped);
console.log(JSON.stringify({
  target,
  total: rows.length,
  retrieval: {
    recallAt1: supported.length ? supported.filter((row) => row.hitAt1).length / supported.length : null,
    recallAt3: supported.length ? supported.filter((row) => row.hitAt3).length / supported.length : null,
    mrr: supported.length ? supported.reduce((sum, row) => sum + row.reciprocalRank, 0) / supported.length : null,
    exactIdentifierRecallAt1: exactIdentifier.length ? exactIdentifier.filter((row) => row.hitAt1).length / exactIdentifier.length : null,
    latenciesMs: retrieved.map((row) => row.latencyMs)
  },
  answers: generation ? {
    statusCounts: Object.groupBy(answerRows, (answer) => answer.status),
    citationValidity: answerRows.length ? answerRows.filter((answer) => answer.citationValid).length / answerRows.length : null,
    expectedStatusAccuracy: answerRows.length ? answerRows.filter((answer) => answer.statusMatchesExpected).length / answerRows.length : null,
    fallbackCases: answerRows.filter((answer) => answer.fallback).length,
    usage: answerRows.map((answer) => answer.usage).filter(Boolean)
  } : { skipped: true, reason: 'GEMINI_API_KEY is not configured.' },
  rows
}, null, 2));
