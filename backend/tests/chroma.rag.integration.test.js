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

try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }

const config = loadConfig();
const localEnabled = process.env.RUN_LIVE_RAG === 'true';
const cloudEnabled = process.env.RUN_LIVE_RAG_CLOUD === 'true' && config.cloudConfigured;

async function exercise(target, client) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const collectionNames = { local: `sl_m1_local_${suffix}`, cloud: `sl_m1_cloud_${suffix}` };
  const repository = createChromaRepository({ clients: { [target]: client }, collectionNames });
  const embeddings = createLocalEmbeddingProvider({ model: config.embedding.model });
  const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-m1-rag-'));
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

describe.skipIf(!localEnabled)('real local Chroma RAG', () => {
  it('ingests and retrieves with precomputed local MiniLM vectors', async () => {
    await exercise('local', new ChromaClient({ host: config.local.host, port: config.local.port, ssl: config.local.ssl }));
  }, 120000);
});

describe.skipIf(!cloudEnabled)('real Cloud Chroma RAG', () => {
  it('ingests and retrieves with precomputed local MiniLM vectors', async () => {
    await exercise('cloud', new CloudClient({ apiKey: config.cloud.apiKey, tenant: config.cloud.tenant, database: config.cloud.database, ...(config.cloud.host ? { host: config.cloud.host } : {}) }));
  }, 120000);
});

if (process.env.RUN_LIVE_RAG_CLOUD === 'true' && !config.cloudConfigured) {
  describe('real Cloud Chroma RAG configuration', () => {
    it('fails clearly until backend Cloud credentials are configured', () => {
      throw new Error('Cloud RAG requires CHROMA_API_KEY, CHROMA_TENANT, and CHROMA_DATABASE in backend/.env.');
    });
  });
}
