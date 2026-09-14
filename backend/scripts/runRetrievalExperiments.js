import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config/environment.js';
import { createChromaClients } from '../src/clients/chromaClients.js';
import { createChromaRepository } from '../src/repositories/chromaRepository.js';
import { createLocalEmbeddingProvider } from '../src/embedding/localMiniLm.js';
import { createLocalReranker } from '../src/services/rerankerService.js';
import { createRetrievalService, termsFrom } from '../src/services/retrievalService.js';
import { calculateCaseMetrics, median, summarizeExperiment } from '../src/evals/chunkingExperimentMetrics.js';
import { aggregateFilterAudit, auditCaseResults, describeUnsupportedBehavior, RETRIEVAL_EXPERIMENT_DEPTHS, stageEvidence, whereFor } from '../src/evals/retrievalExperimentMetrics.js';
import { chunkDocument } from '../src/chunking/chunkDocument.js';

const fixture = JSON.parse(await readFile(new URL('../fixtures/retrieval/m3-advanced-retrieval.json', import.meta.url), 'utf8'));
const config = loadConfig();
const runId = randomUUID().replaceAll('-', '').slice(0, 12);
const collectionName = `m3exp_${runId}`;
const modes = ['vector', 'keyword', 'hybrid', 'reranked'];
const TIMED_RUNS = 3;

async function timedRetrieve(retrieve, testCase) {
  await retrieve(testCase);
  const samples = [];
  let result;
  for (let index = 0; index < TIMED_RUNS; index += 1) {
    const started = performance.now();
    result = await retrieve(testCase);
    samples.push(Math.round((performance.now() - started) * 100) / 100);
  }
  return { result, samples };
}

async function main() {
  const clients = createChromaClients(config);
  await clients.local.heartbeat();
  const outputPath = process.env.M3_EXPERIMENT_OUTPUT || path.resolve('.local/evals', `m3-retrieval-${runId}.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const baseRepository = createChromaRepository({ clients, collectionNames: { local: collectionName } });
  let output;
  try {
    const embeddings = createLocalEmbeddingProvider({ model: config.embedding.model });
    await embeddings.prepare();
    const prepared = fixture.documents.flatMap((document) => chunkDocument(document.content, {
      strategy: 'heading-aware', maxTokens: 240, overlapTokens: 15, tokenizer: embeddings.tokenizer, source: document.source
    }).map((chunk, index) => ({ document, chunk, id: `${document.id}:${index}` })));
    const vectors = await embeddings.embed(prepared.map(({ chunk }) => chunk.content));
    await baseRepository.addChunks('local', prepared.map(({ document, chunk, id }, index) => ({
      id, content: chunk.content, embedding: vectors[index],
      metadata: { documentId: document.id, source: document.source, section: chunk.section || '', product: document.product, documentType: document.documentType, documentVersion: document.documentVersion }
    })));
    const repository = {
      query: (target, embedding, limit, options) => baseRepository.query(target, embedding, limit, options),
      keyword: (target, terms, limit, options) => baseRepository.keyword(target, terms, limit, options)
    };
    const reranker = createLocalReranker({ model: config.rag.rerankerModel || undefined });
    const retrieval = createRetrievalService({ config, embeddings, repository, reranker });
    output = { fixtureVersion: fixture.fixtureVersion, runId, target: 'local', collection: collectionName, corpus: fixture.documents.map(({ id, source, product, documentVersion }) => ({ id, source, product, documentVersion })), datasetExpectations: fixture.cases, config: { embeddingModel: embeddings.model, chunking: { strategy: 'heading-aware', maxTokens: 240, overlapTokens: 15 }, depths: RETRIEVAL_EXPERIMENT_DEPTHS, timedRunsPerCase: TIMED_RUNS }, stages: {} };

    let rerankerFirstUseLatencyMs = null;
    for (const mode of modes) {
      let stagePreparationFailure = null;
      if (mode === 'reranked') {
        const started = performance.now();
        try {
          await reranker.prepare();
          rerankerFirstUseLatencyMs = Math.round((performance.now() - started) * 100) / 100;
        } catch (error) {
          stagePreparationFailure = { phase: 'reranker_prepare', code: error.code || 'reranker_prepare_failed', message: error.message };
        }
      }
      const rows = [];
      const failures = stagePreparationFailure ? [stagePreparationFailure] : [];
      for (const testCase of fixture.cases) {
        try {
          const where = whereFor(testCase.filters);
          const request = { question: testCase.question, target: 'local', filters: testCase.filters || {}, mode: mode === 'keyword' ? 'hybrid' : mode, nResults: 5 };
          const retrieve = mode === 'keyword'
            ? async () => {
              const candidates = where ? await repository.keyword('local', termsFrom(testCase.question), 20, { where }) : await repository.keyword('local', termsFrom(testCase.question), 20);
              return { results: candidates.slice(0, RETRIEVAL_EXPERIMENT_DEPTHS.keyword.finalDepth), candidates, latencyMs: 0 };
            }
            : () => retrieval.retrieve(request);
          const measured = await timedRetrieve(retrieve, testCase);
          rows.push({ ...calculateCaseMetrics(testCase, measured.result.results, median(measured.samples), measured.samples), stage: mode, error: null, stageLatencyMs: measured.result.latencyMs, keywordTerms: mode === 'keyword' || mode === 'hybrid' || mode === 'reranked' ? termsFrom(testCase.question) : [], stageEvidence: stageEvidence(measured.result.stages), filterAudit: auditCaseResults(testCase, measured.result.results), unsupportedBehavior: describeUnsupportedBehavior(testCase, measured.result.results), firstRerankerUseLatencyMs: mode === 'reranked' ? rerankerFirstUseLatencyMs : null });
        } catch (error) {
          failures.push({ caseId: testCase.id, code: error.code || 'retrieval_failed', message: error.message });
          rows.push({ ...calculateCaseMetrics(testCase, [], null, []), stage: mode, error: error.code || 'retrieval_failed', keywordTerms: mode === 'keyword' || mode === 'hybrid' || mode === 'reranked' ? termsFrom(testCase.question) : [], stageEvidence: {}, filterAudit: auditCaseResults(testCase, []), unsupportedBehavior: describeUnsupportedBehavior(testCase, []) });
        }
      }
      const summary = summarizeExperiment({ config: { name: mode, stage: mode, depths: RETRIEVAL_EXPERIMENT_DEPTHS[mode] }, cases: fixture.cases, chunkCount: prepared.length, tokenCounts: prepared.map(({ chunk }) => chunk.tokenCount), ingestionLatencyMs: null, rows });
      output.stages[mode] = { ...summary, failures, filterAudit: aggregateFilterAudit(rows), reranker: mode === 'reranked' ? { model: reranker.model, firstUseLatencyMs: rerankerFirstUseLatencyMs, warmMedianLatencyMs: median(rows.flatMap((row) => row.retrievalLatencySamplesMs)) } : null };
    }
  } finally {
    output ||= { fixtureVersion: fixture.fixtureVersion, runId, target: 'local', collection: collectionName, datasetExpectations: fixture.cases, stages: {} };
    output.cleanup = { collectionOwnedByRun: collectionName, deleted: false };
    let persistenceError;
    try { await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8'); } catch (error) { persistenceError = error; }
    let cleanupError;
    try { await baseRepository.deleteCollection('local', { collectionName }); output.cleanup.deleted = true; } catch (error) { cleanupError = error; }
    try { await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8'); } catch (error) { persistenceError ||= error; }
    if (persistenceError && cleanupError) throw new AggregateError([persistenceError, cleanupError], 'Retrieval experiment persistence and cleanup both failed.', { cause: persistenceError });
    if (persistenceError) throw persistenceError;
    if (cleanupError) throw cleanupError;
  }
  console.table(Object.values(output.stages).map((stage) => ({ stage: stage.config.name, recallAt1: stage.retrieval.recallAt1, recallAt3: stage.retrieval.recallAt3, mrr: stage.retrieval.mrr, exactIdAt1: stage.retrieval.exactIdentifierRecallAt1, factsAt4: stage.retrieval.requiredFactCoverageAt4, medianMs: stage.retrievalLatencyMedianMs, firstRerankerMs: stage.reranker?.firstUseLatencyMs || null })));
  console.log(`Machine-readable results: ${outputPath}`);
}

try { await main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
