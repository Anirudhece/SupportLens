import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { loadConfig } from '../src/config/environment.js';
import { createChromaClients } from '../src/clients/chromaClients.js';
import { createChromaRepository } from '../src/repositories/chromaRepository.js';
import { createLocalEmbeddingProvider } from '../src/embedding/localMiniLm.js';
import { createRetrievalService } from '../src/services/retrievalService.js';
import { createGenerationService, isDeterministicFallback } from '../src/services/generationService.js';
import { chunkDocument } from '../src/chunking/chunkDocument.js';
import { evaluateAnswer, evaluateRetrieval } from '../src/evals/trustMetrics.js';
import { buildReport, compareBaseline, gateFailures, loadBaseline, writeReports } from '../src/evals/regressionReport.js';
import { createGeminiPacer } from '../src/evals/livePacing.js';

const args = process.argv.slice(2);
const live = args.includes('--live');
const baselineArg = args.find((arg) => arg.startsWith('--baseline='))?.slice('--baseline='.length);
const fixture = JSON.parse(await readFile(new URL('../evals/golden-cases.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('../evals/corpus-manifest.json', import.meta.url), 'utf8'));
const config = loadConfig();
const clients = createChromaClients(config);
const collectionName = `supportlens_m4_eval_${randomUUID().replaceAll('-', '')}`;
const registry = { getActiveCollection: async () => collectionName };
const repository = createChromaRepository({ clients, registry });
const embeddings = createLocalEmbeddingProvider({ model: config.embedding.model });
const retrieval = createRetrievalService({ config: { ...config, rag: { ...config.rag, retrievalK: 3, chunkStrategy: 'heading-aware', chunkTokens: 240, chunkOverlap: 15 } }, embeddings, repository });
const outputDir = path.resolve(new URL('../.local/evals/', import.meta.url).pathname);
let generation = null;
const rows = [];
const liveStats = { intervalMs: 4500, callCount: 0, lastStart: null, stoppedReason: null, completedAnswers: 0 };
let report = null;
let runError = null;
function bounded(promise, ms = 20000) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('evaluation operation timed out'), { code: 'evaluation_timeout' })), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
try {
  const corpusNames = (await readdir(new URL('../fixtures/corpus/', import.meta.url))).filter((name) => name.endsWith('.md')).sort();
  const manifestNames = Object.keys(manifest.documents).sort();
  if (JSON.stringify(corpusNames) !== JSON.stringify(manifestNames) || fixture.cases.some((item) => (item.expectedSources || []).some((source) => !manifest.documents[source]))) throw Object.assign(new Error('Evaluation fixture/manifest preflight failed.'), { code: 'fixture_preflight_failed' });
  await bounded(clients.local?.heartbeat?.() || Promise.resolve(), 5000);
  await bounded(embeddings.prepare?.() || Promise.resolve(), 120000);
  const corpusDir = new URL('../fixtures/corpus/', import.meta.url);
  const names = (await readdir(corpusDir)).filter((name) => name.endsWith('.md'));
  const corpusContents = [];
  let sequence = 0;
  for (const name of names) {
    const content = await readFile(new URL(name, corpusDir), 'utf8');
    const metadata = manifest.documents[name];
    corpusContents.push([name, content, metadata]);
    const chunks = chunkDocument(content, { strategy: 'heading-aware', maxTokens: 240, overlapTokens: 15, tokenizer: embeddings.tokenizer, source: name });
    const vectors = await bounded(embeddings.embed(chunks.map((chunk) => chunk.content)), 120000);
    await bounded(repository.addChunks('local', chunks.map((chunk, index) => ({ id: `m4-${sequence++}`, content: chunk.content, embedding: vectors[index], metadata: { source: name, section: chunk.section || '', ...metadata } })), { collectionName }), 30000);
  }
  if (live && config.generation.apiKey) generation = createGenerationService({ config });
  for (const testCase of fixture.cases) {
    let retrievalResult; let error = null;
    try { retrievalResult = await bounded(retrieval.retrieve({ question: testCase.question, target: 'local', nResults: 4, filters: testCase.filters || {} }), 20000); } catch (caught) { error = caught; }
    const retrievalRow = evaluateRetrieval({ testCase, retrieval: retrievalResult, error });
    const answer = live ? { skipped: true, reason: generation ? 'pending live answer phase' : 'GEMINI_API_KEY not configured' } : { skipped: true, reason: 'live evaluation disabled (use --live)' };
    rows.push({ id: testCase.id, testCase, retrieval: retrievalRow, retrievalRaw: retrievalResult ? { results: retrievalResult.results, latencyMs: retrievalResult.latencyMs, embeddingLatencyMs: retrievalResult.embeddingLatencyMs, queryLatencyMs: retrievalResult.queryLatencyMs } : null, answer });
  }
  if (generation) {
    const pacer = createGeminiPacer({ minIntervalMs: 4500 });
    for (const [index, row] of rows.entries()) {
      if (row.retrieval.error) { row.answer = { skipped: true, reason: 'retrieval_error' }; continue; }
      if (isDeterministicFallback({ question: row.testCase.question, results: row.retrievalRaw?.results || [] })) {
        const raw = await generation.answer({ question: row.testCase.question, results: row.retrievalRaw?.results || [] });
        row.answer = { ...evaluateAnswer({ testCase: row.testCase, answer: raw, retrieval: { results: row.retrievalRaw?.results || [] } }), rawAnswer: raw, deterministic: true };
        liveStats.completedAnswers += 1;
        continue;
      }
      try {
        const started = await pacer.beforeCall(); liveStats.lastStart = started; liveStats.callCount = pacer.stats().callCount;
        const raw = await generation.answer({ question: row.testCase.question, results: row.retrievalRaw?.results || [] });
        row.answer = { ...evaluateAnswer({ testCase: row.testCase, answer: raw, retrieval: { results: row.retrievalRaw?.results || [] } }), rawAnswer: raw };
        liveStats.completedAnswers += 1;
        console.log(`Gemini evaluation ${index + 1}/${rows.length} completed`);
      } catch (caught) {
        row.answer = { error: caught.code || caught.message, answerError: true, statusMatchesExpected: false, citationValidity: false, factCoverage: 0, forbiddenViolations: [], securityPass: false };
        if (/quota|rate|resource_exhausted|permission|timeout|network|fetch|unavailable|503|429/i.test(caught.code || caught.message || '')) {
          liveStats.stoppedReason = caught.code || caught.message;
          for (const skipped of rows.slice(index + 1)) skipped.answer = { skipped: true, reason: 'provider_stopped' };
          break;
        }
      }
    }
  }
  const evalConfig = { ...config, corpusHash: createHash('sha256').update(JSON.stringify(corpusContents)).digest('hex') };
  report = buildReport({ fixture, config: evalConfig, rows, mode: live ? 'live' : 'retrieval-only', skipped: rows.filter((row) => row.answer?.skipped).map((row) => row.id) });
  const baseline = baselineArg ? await loadBaseline(baselineArg) : null;
  const comparison = compareBaseline(report, baseline);
  report.comparison = comparison;
  report.liveEvaluation = liveStats;
  report.failures = gateFailures(report, comparison);
} catch (error) {
  runError = { phase: error.code === 'fixture_preflight_failed' ? 'preflight' : 'execution', code: error.code || 'evaluation_failed', message: error.message };
} finally {
  let cleanup = { collectionOwnedByRun: true, deleted: false, error: null };
  try { await bounded(repository.deleteCollection('local', { collectionName }), 10000); cleanup.deleted = true; } catch (error) { cleanup.error = error.message; }
  if (!report) {
    report = buildReport({ fixture, config, rows, mode: live ? 'live' : 'retrieval-only', skipped: fixture.cases.slice(rows.length).map((item) => item.id) });
    report.failures = [`${runError?.phase || 'execution'} failure: ${runError?.message || 'unknown error'}`];
  }
  report.cleanup = cleanup;
  if (cleanup.error) report.failures.push(`cleanup failed: ${cleanup.error}`);
  const written = await writeReports(report, outputDir);
  console.log(JSON.stringify({ report: written.jsonPath, markdown: written.mdPath, identity: report.identity.hash, failures: report.failures }, null, 2));
  process.exitCode = report.failures.length || cleanup.error ? 1 : 0;
}
