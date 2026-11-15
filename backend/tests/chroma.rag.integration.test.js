import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ChromaClient, CloudClient } from 'chromadb';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/environment.js';
import { createLocalEmbeddingProvider } from '../src/embedding/localMiniLm.js';
import { createChromaRepository } from '../src/repositories/chromaRepository.js';
import { createIngestionService } from '../src/services/ingestionService.js';
import { createDocumentRegistry } from '../src/services/documentRegistry.js';
import { createRetrievalService } from '../src/services/retrievalService.js';
import { createGenerationService } from '../src/services/generationService.js';

try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }

const config = loadConfig();
const localEnabled = process.env.RUN_LIVE_RAG === 'true';
const cloudEnabled = process.env.RUN_LIVE_RAG_CLOUD === 'true' && config.cloudConfigured;

async function exercise(target, client) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const collectionNames = { local: `sl_m2_local_${suffix}`, cloud: `sl_m2_cloud_${suffix}` };
  const repository = createChromaRepository({ clients: { [target]: client }, collectionNames });
  const embeddings = createLocalEmbeddingProvider({ model: config.embedding.model });
  const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-m2-rag-'));
  const registry = createDocumentRegistry({ path: path.join(root, 'documents.json') });
  const ingestion = createIngestionService({ config: { ...config, storage: { ...config.storage, uploadDir: root } }, embeddings, repository, registry });
  try {
    const document = await ingestion.ingest({ buffer: Buffer.from('# Payment errors\n\nPAYMENT_4027 means the stored payment method is expired.'), originalName: `live-${suffix}.md`, mimeType: 'text/markdown', target });
    expect(document.status).toBe('ready');
    expect(document.chunkCount).toBeGreaterThan(0);
    const [vector] = await embeddings.embed(['What does PAYMENT_4027 mean?']);
    expect(vector).toHaveLength(384);
    const result = await createRetrievalService({ config, embeddings, repository }).retrieve({ question: 'What does PAYMENT_4027 mean?', target, nResults: 3 });
    expect(result.results[0].metadata.source).toBe(`live-${suffix}.md`);
  } finally {
    await repository.deleteCollection(target).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}

async function exerciseAdvancedRetrieval(target, client) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const collectionName = `sl_m3_rag_${target}_${suffix}`;
  const repository = createChromaRepository({ clients: { [target]: client }, collectionNames: { [target]: collectionName } });
  const embeddings = createLocalEmbeddingProvider({ model: config.embedding.model });
  try {
    await embeddings.prepare();
    const records = [
      { id: 'billing-v2', source: 'billing-v2.md', product: 'billing', documentVersion: 'v2', content: 'PAYMENT_4027 means the stored payment method expired in billing v2.' },
      { id: 'billing-v1', source: 'billing-v1.md', product: 'billing', documentVersion: 'v1', content: 'PAYMENT_4027 is not used by the billing v1 renewal flow.' },
      { id: 'analytics-v2', source: 'analytics-v2.md', product: 'analytics', documentVersion: 'v2', content: 'Analytics v2 upgrades recalculate event quota and do not create a billing charge.' }
    ];
    const vectors = await embeddings.embed(records.map((record) => record.content));
    await repository.addChunks(target, records.map((record, index) => ({
      id: record.id, content: record.content, embedding: vectors[index],
      metadata: { source: record.source, product: record.product, documentVersion: record.documentVersion }
    })));
    const retrieval = createRetrievalService({ config: { ...config, rag: { ...config.rag, retrievalK: 3 } }, embeddings, repository });
    const filters = { product: 'billing', documentVersion: 'v2' };
    const vector = await retrieval.retrieve({ target, question: 'What does PAYMENT_4027 mean?', filters, mode: 'vector', nResults: 3 });
    expect(vector.results.length).toBeGreaterThan(0);
    expect(vector.results.every((result) => result.metadata.product === 'billing' && result.metadata.documentVersion === 'v2')).toBe(true);
    const hybrid = await retrieval.retrieve({ target, question: 'What does PAYMENT_4027 mean?', filters, mode: 'hybrid', nResults: 3 });
    expect(hybrid.results.length).toBeGreaterThan(0);
    expect(hybrid.results.every((result) => result.metadata.product === 'billing' && result.metadata.documentVersion === 'v2')).toBe(true);
    const noMatch = await retrieval.retrieve({ target, question: 'What does PAYMENT_4027 mean?', filters: { product: 'shipping' }, mode: 'hybrid', nResults: 3 });
    expect(noMatch.results).toEqual([]);
    const keyword = await repository.keyword(target, ['PAYMENT_4027'], 10, { where: { $and: [{ product: filters.product }, { documentVersion: filters.documentVersion }] } });
    expect(keyword.map((result) => result.id)).toContain('billing-v2');
    expect(keyword.every((result) => result.metadata.product === 'billing' && result.metadata.documentVersion === 'v2')).toBe(true);
  } finally {
    await repository.deleteCollection(target, { collectionName }).catch(() => {});
  }
}

describe.skipIf(!localEnabled)('real local Chroma RAG', () => {
  it('ingests and retrieves with precomputed local MiniLM vectors', async () => {
    await exercise('local', new ChromaClient({ host: config.local.host, port: config.local.port, ssl: config.local.ssl }));
  }, 120000);
});

describe.skipIf(!cloudEnabled)('real Cloud Chroma RAG', () => {
  it('ingests and retrieves with precomputed local MiniLM vectors', async () => {
    // This signal bounds the entire transient client lifetime, including cleanup,
    // below Vitest's 120s test timeout; it is not an individual operation timeout.
    await exercise('cloud', new CloudClient({ apiKey: config.cloud.apiKey, tenant: config.cloud.tenant, database: config.cloud.database, ...(config.cloud.host ? { host: config.cloud.host } : {}), fetchOptions: { signal: AbortSignal.timeout(90000) } }));
  }, 120000);
});

describe.skipIf(!localEnabled && !cloudEnabled)('real M3 filter and hybrid retrieval', () => {
  it('keeps metadata filters target-scoped and retrieves exact identifiers', async () => {
    if (localEnabled) await exerciseAdvancedRetrieval('local', new ChromaClient({ host: config.local.host, port: config.local.port, ssl: config.local.ssl }));
    if (cloudEnabled) await exerciseAdvancedRetrieval('cloud', new CloudClient({ apiKey: config.cloud.apiKey, tenant: config.cloud.tenant, database: config.cloud.database, ...(config.cloud.host ? { host: config.cloud.host } : {}), fetchOptions: { signal: AbortSignal.timeout(90000) } }));
  }, 120000);
});

const geminiEnabled = process.env.RUN_LIVE_GEMINI === 'true' && Boolean(config.generation.apiKey);
describe.skipIf(!geminiEnabled)('live Gemini synthetic guardrails', () => {
  it('answers from synthetic context and falls back with no context', async () => {
    const generation = createGenerationService({ config });
    const answered = await generation.answer({ question: 'What does PAYMENT_4027 mean?', results: [{ id: 'synthetic-payment', content: 'PAYMENT_4027 means the stored payment method expired.', metadata: { source: 'synthetic-payment.md' } }] });
    expect(answered.status).toBe('answered');
    expect(answered.citationIds).toContain('synthetic-payment');
    const fallback = await generation.answer({ question: 'What is the payroll tax policy?', results: [] });
    expect(fallback).toMatchObject({ status: 'insufficient_context', citationIds: [] });
  }, 90000);
});

if (process.env.RUN_LIVE_RAG_CLOUD === 'true' && !config.cloudConfigured) {
  describe('real Cloud Chroma RAG configuration', () => {
    it('fails clearly until backend Cloud credentials are configured', () => {
      throw new Error('Cloud RAG requires CHROMA_API_KEY, CHROMA_TENANT, and CHROMA_DATABASE in backend/.env.');
    });
  });
}
