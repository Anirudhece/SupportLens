import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { prepareReindexRecords, reindexDocuments } from '../scripts/reindex.js';
import { createIngestionService } from '../src/services/ingestionService.js';
import { createDocumentRegistry } from '../src/services/documentRegistry.js';

const config = {
  cloudConfigured: true,
  rag: { chunkStrategy: 'heading-aware', chunkTokens: 240, chunkOverlap: 15 }
};

function makeEmbeddings() {
  return {
    tokenizer: { encode: (text) => ({ ids: text.split(/\s+/).filter(Boolean) }) },
    prepare: vi.fn().mockResolvedValue(),
    embed: vi.fn().mockImplementation(async (texts) => texts.map((_, index) => [index + 0.1, index + 0.2]))
  };
}

function makeRegistry(documents) {
  return {
    list: vi.fn().mockResolvedValue(documents),
    updateChunking: vi.fn().mockResolvedValue(documents),
    activateCollectionAndUpdateChunking: vi.fn().mockResolvedValue(documents),
    withTargetLock: vi.fn((_target, callback) => callback())
  };
}

function makeRepository(count) {
  return {
    deleteCollection: vi.fn().mockResolvedValue(),
    addChunks: vi.fn().mockResolvedValue(),
    count: vi.fn().mockResolvedValue(count)
  };
}

const extract = vi.fn().mockResolvedValue({
  text: '# Billing\n\nPayment retry is safe.',
  sections: [{ text: '# Billing\n\nPayment retry is safe.', page: 2 }]
});

describe('M2 registry reindex', () => {
  it('rejects an invalid embedding batch size before rebuilding', async () => {
    await expect(reindexDocuments({
      config, target: 'local', batchSize: 0, embeddings: makeEmbeddings(), repository: makeRepository(0), registry: makeRegistry([])
    })).rejects.toThrow('batchSize must be a positive integer');
  });

  it('rebuilds only the selected target and updates registry metadata once', async () => {
    const documents = [
      { id: 'local-doc', target: 'local', name: 'billing.md', checksum: 'abc', version: 3, status: 'ready', storedPath: '/tmp/billing.md' },
      { id: 'pending-doc', target: 'local', name: 'pending.md', checksum: 'def', version: 1, status: 'processing', storedPath: '/tmp/pending.md' }
    ];
    const registry = makeRegistry(documents);
    const repository = makeRepository(1);
    const embeddings = makeEmbeddings();
    const readDocument = vi.fn().mockResolvedValue(Buffer.from('source'));
    const result = await reindexDocuments({
      config,
      target: 'local',
      embeddings,
      repository,
      registry,
      readDocument,
      extract
    });

    expect(registry.list).toHaveBeenCalledWith('local');
    expect(registry.withTargetLock).toHaveBeenCalledWith('local', expect.any(Function));
    expect(readDocument).toHaveBeenCalledWith('/tmp/billing.md');
    expect(readDocument).not.toHaveBeenCalledWith('/tmp/pending.md');
    expect(repository.addChunks).toHaveBeenCalledOnce();
    expect(repository.addChunks.mock.calls[0][0]).toBe('local');
    expect(repository.addChunks.mock.calls[0][2]).toMatchObject({ batchSize: 64, collectionName: expect.stringMatching(/^supportlens_m2_local_reindex_/) });
    expect(repository.addChunks.mock.calls[0][1][0]).toMatchObject({
      id: 'local-doc-0',
      metadata: {
        documentId: 'local-doc', source: 'billing.md', checksum: 'abc', version: 3, page: 2, section: 'Billing'
      }
    });
    expect(registry.activateCollectionAndUpdateChunking).toHaveBeenCalledOnce();
    expect(registry.activateCollectionAndUpdateChunking).toHaveBeenCalledWith(
      'local', expect.stringMatching(/^supportlens_m2_local_reindex_/), [
      { id: 'local-doc', chunkCount: 1, chunkingVersion: 'm2-heading-aware-240-15' }
    ], 'supportlens_m2_local');
    expect(result).toMatchObject({ target: 'local', documents: 1, chunks: 1 });
    expect(result.collection).toMatch(/^supportlens_m2_local_reindex_/);
  });

  it('retains a candidate when activation may have committed before reporting an error', async () => {
    let active = 'supportlens_m2_local';
    const registry = makeRegistry([{ id: 'local-doc', target: 'local', name: 'billing.md', checksum: 'abc', version: 1, status: 'ready', storedPath: '/tmp/billing.md' }]);
    registry.getActiveCollection = vi.fn().mockImplementation(async () => active);
    registry.activateCollectionAndUpdateChunking.mockImplementation(async (_target, candidate) => {
      active = candidate;
      throw new Error('lock release failed after registry commit');
    });
    const repository = makeRepository(1);

    await expect(reindexDocuments({
      config, target: 'local', embeddings: makeEmbeddings(), repository, registry,
      readDocument: vi.fn().mockResolvedValue(Buffer.from('source')), extract
    })).rejects.toMatchObject({ name: 'AggregateError', message: expect.stringContaining('retaining active candidate') });
    expect(repository.deleteCollection).not.toHaveBeenCalled();
  });

  it('cleans only the candidate when verification fails and preserves registry metadata', async () => {
    const registry = makeRegistry([{ id: 'local-doc', target: 'local', name: 'billing.md', checksum: 'abc', version: 1, status: 'ready', storedPath: '/tmp/billing.md' }]);
    const repository = makeRepository(0);
    const embeddings = makeEmbeddings();

    await expect(reindexDocuments({
      config,
      target: 'local',
      embeddings,
      repository,
      registry,
      readDocument: vi.fn().mockResolvedValue(Buffer.from('source')),
      extract
    })).rejects.toThrow('Reindex verification failed');

    expect(repository.deleteCollection).toHaveBeenCalledOnce();
    expect(repository.deleteCollection.mock.calls[0][1].collectionName).toMatch(/^supportlens_m2_local_reindex_/);
    expect(registry.activateCollectionAndUpdateChunking).not.toHaveBeenCalled();
  });

  it('leaves the active pointer and chunk metadata unchanged when a candidate fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-reindex-preserve-'));
    const registryPath = path.join(root, 'documents.json');
    await writeFile(registryPath, JSON.stringify({
      collections: { local: { active: 'supportlens_m2_local_old', history: [] } },
      documents: [{ id: 'local-doc', target: 'local', name: 'billing.md', checksum: 'abc', version: 1, status: 'ready', chunkCount: 99, storedPath: '/tmp/billing.md' }]
    }), 'utf8');
    const registry = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 100, lockRetryMs: 5 });
    const repository = makeRepository(0);
    try {
      await expect(reindexDocuments({
        config, target: 'local', embeddings: makeEmbeddings(), repository, registry,
        readDocument: vi.fn().mockResolvedValue(Buffer.from('source')), extract
      })).rejects.toThrow('Reindex verification failed');
      const state = JSON.parse(await readFile(registryPath, 'utf8'));
      expect(state.collections.local.active).toBe('supportlens_m2_local_old');
      expect(state.documents[0].chunkCount).toBe(99);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('surfaces a cleanup failure together with the original reindex failure', async () => {
    const registry = makeRegistry([{ id: 'local-doc', target: 'local', name: 'billing.md', checksum: 'abc', version: 1, status: 'ready', storedPath: '/tmp/billing.md' }]);
    const repository = makeRepository(0);
    repository.deleteCollection
      .mockRejectedValueOnce(new Error('cleanup unavailable'));

    await expect(reindexDocuments({
      config,
      target: 'local',
      embeddings: makeEmbeddings(),
      repository,
      registry,
      readDocument: vi.fn().mockResolvedValue(Buffer.from('source')),
      extract
    })).rejects.toMatchObject({
      name: 'AggregateError',
      message: expect.stringContaining('cleanup failed')
    });
    expect(repository.deleteCollection).toHaveBeenCalledOnce();
  });

  it('rejects an empty ready set before touching the selected collection', async () => {
    const repository = makeRepository(0);
    await expect(reindexDocuments({
      config,
      target: 'local',
      embeddings: makeEmbeddings(),
      repository,
      registry: makeRegistry([])
    })).rejects.toMatchObject({ code: 'no_ready_documents' });
    expect(repository.deleteCollection).not.toHaveBeenCalled();
  });

  it('prepares the tokenizer before chunking and only prepares once', async () => {
    const embeddings = {
      tokenizer: null,
      prepare: vi.fn().mockImplementation(async () => {
        embeddings.tokenizer = { encode: (text) => ({ ids: [...text] }) };
      }),
      embed: vi.fn().mockImplementation(async (texts) => texts.map(() => [0.1, 0.2]))
    };
    const registry = makeRegistry([{ id: 'local-doc', target: 'local', name: 'billing.md', checksum: 'abc', version: 1, status: 'ready', storedPath: '/tmp/billing.md' }]);
    const repository = makeRepository(2);
    const result = await reindexDocuments({
      config: { ...config, rag: { ...config.rag, chunkTokens: 4, chunkOverlap: 0 } },
      target: 'local',
      embeddings,
      repository,
      registry,
      readDocument: vi.fn().mockResolvedValue(Buffer.from('source')),
      extract: vi.fn().mockResolvedValue({ text: 'abcd efgh' })
    });

    expect(embeddings.prepare).toHaveBeenCalledOnce();
    expect(result.chunks).toBe(2);
    expect(repository.addChunks.mock.calls[0][1]).toHaveLength(2);
  });

  it('deletes only explicitly evicted rollback collections after activation', async () => {
    const registry = makeRegistry([{ id: 'local-doc', target: 'local', name: 'billing.md', checksum: 'abc', version: 1, status: 'ready', storedPath: '/tmp/billing.md' }]);
    registry.activateCollectionAndUpdateChunking.mockResolvedValue({ documents: [], evictedCollections: ['old-collection'] });
    const repository = makeRepository(1);
    const result = await reindexDocuments({
      config, target: 'local', embeddings: makeEmbeddings(), repository, registry,
      readDocument: vi.fn().mockResolvedValue(Buffer.from('source')), extract
    });
    expect(repository.deleteCollection).toHaveBeenCalledWith('local', { collectionName: 'old-collection' });
    expect(result.evictedCollections).toEqual(['old-collection']);
    expect(result.cleanupWarnings).toEqual([]);
  });

  it('reports rollback cleanup failures without deleting the active candidate', async () => {
    const registry = makeRegistry([{ id: 'local-doc', target: 'local', name: 'billing.md', checksum: 'abc', version: 1, status: 'ready', storedPath: '/tmp/billing.md' }]);
    registry.activateCollectionAndUpdateChunking.mockResolvedValue({ documents: [], evictedCollections: ['old-collection'] });
    const repository = makeRepository(1);
    repository.deleteCollection.mockRejectedValue(new Error('old collection unavailable'));
    const result = await reindexDocuments({
      config, target: 'local', embeddings: makeEmbeddings(), repository, registry,
      readDocument: vi.fn().mockResolvedValue(Buffer.from('source')), extract
    });
    expect(result.cleanupWarnings).toEqual([expect.objectContaining({ collection: 'old-collection', code: 'rollback_collection_cleanup_failed' })]);
    expect(repository.deleteCollection).toHaveBeenCalledTimes(1);
  });

  it('embeds a corpus larger than one batch without an all-corpus call', async () => {
    const documents = Array.from({ length: 3 }, (_, index) => ({
      id: `doc-${index}`, target: 'local', name: `doc-${index}.md`, checksum: `checksum-${index}`, version: 1,
      status: 'ready', storedPath: `/tmp/doc-${index}.md`
    }));
    const embeddings = makeEmbeddings();
    await prepareReindexRecords({
      documents,
      config: { ...config, rag: { ...config.rag, chunkTokens: 2, chunkOverlap: 0 } },
      embeddings,
      batchSize: 2,
      readDocument: vi.fn().mockResolvedValue(Buffer.from('one two three')),
      extract: vi.fn().mockResolvedValue({ text: 'one two three' })
    });
    expect(embeddings.embed.mock.calls.map(([texts]) => texts.length)).toEqual([2, 2, 2]);
  });

  it('preserves document metadata and numeric version on every produced chunk', async () => {
    const documents = [{
      id: 'billing-doc', target: 'local', name: 'billing.md', checksum: 'checksum', version: 7,
      product: 'billing', documentType: 'guide', documentVersion: 'v2', status: 'ready', storedPath: '/tmp/billing.md'
    }];
    const prepared = await prepareReindexRecords({
      documents,
      config: { ...config, rag: { ...config.rag, chunkTokens: 2, chunkOverlap: 0 } },
      embeddings: makeEmbeddings(),
      readDocument: vi.fn().mockResolvedValue(Buffer.from('source')),
      extract: vi.fn().mockResolvedValue({ text: 'one two three four five six' })
    });

    expect(prepared.records.length).toBeGreaterThan(1);
    expect(prepared.records.every(({ metadata }) => metadata.product === 'billing'
      && metadata.documentType === 'guide'
      && metadata.documentVersion === 'v2'
      && metadata.version === 7)).toBe(true);
  });

  it('fails closed before touching Chroma when Cloud is not configured', async () => {
    const registry = makeRegistry([]);
    const repository = makeRepository(0);
    await expect(reindexDocuments({
      config: { ...config, cloudConfigured: false },
      target: 'cloud',
      embeddings: makeEmbeddings(),
      repository,
      registry
    })).rejects.toMatchObject({ code: 'cloud_not_configured' });
    expect(registry.list).not.toHaveBeenCalled();
    expect(repository.deleteCollection).not.toHaveBeenCalled();
  });

  it('rejects invalid targets before reading the registry', async () => {
    const registry = makeRegistry([]);
    await expect(reindexDocuments({
      config,
      target: 'other',
      embeddings: makeEmbeddings(),
      repository: makeRepository(0),
      registry
    })).rejects.toMatchObject({ code: 'invalid_target' });
    expect(registry.list).not.toHaveBeenCalled();
  });

  it('holds the target lock across rebuild preparation so same-target ingestion cannot add chunks mid-rebuild', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-target-lock-'));
    const registryPath = path.join(root, 'documents.json');
    const storedPath = path.join(root, 'source.md');
    const events = [];
    let releasePreparation;
    let preparationStarted;
    const preparationGate = new Promise((resolve) => { releasePreparation = resolve; });
    const preparationStartedGate = new Promise((resolve) => { preparationStarted = resolve; });
    await writeFile(registryPath, JSON.stringify({ documents: [{
      id: 'existing-doc', target: 'local', name: 'existing.md', checksum: 'existing-checksum', version: 1,
      status: 'ready', storedPath, chunkCount: 1
    }] }), 'utf8');
    const registry = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 1000, lockRetryMs: 5 });
    const reindexEmbeddings = makeEmbeddings();
    const reindexRepository = {
      deleteCollection: vi.fn(async () => { events.push('reindex-delete'); }),
      addChunks: vi.fn(async () => { events.push('reindex-add'); }),
      count: vi.fn().mockResolvedValue(1)
    };
    const reindexPromise = reindexDocuments({
      config,
      target: 'local',
      embeddings: reindexEmbeddings,
      repository: reindexRepository,
      registry,
      readDocument: vi.fn().mockResolvedValue(Buffer.from('existing source')),
      extract: vi.fn().mockImplementation(async () => {
        preparationStarted();
        await preparationGate;
        return { text: '# Existing\n\nRebuilt content.' };
      })
    });
    try {
      await preparationStartedGate;
      const uploadRepository = {
        addChunks: vi.fn(async () => { events.push('upload-add'); })
      };
      const ingestion = createIngestionService({
        config: { storage: { uploadDir: root }, rag: config.rag },
        embeddings: {
          tokenizer: { encode: (text) => ({ ids: text.split(/\s+/).filter(Boolean) }) },
          prepare: vi.fn().mockResolvedValue(),
          embed: vi.fn().mockResolvedValue([[0.1, 0.2]])
        },
        repository: uploadRepository,
        registry
      });
      const uploadPromise = ingestion.ingest({
        buffer: Buffer.from('# New\n\nUpload content.'),
        originalName: 'new.md',
        mimeType: 'text/markdown',
        target: 'local'
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(uploadRepository.addChunks).not.toHaveBeenCalled();

      releasePreparation();
      await reindexPromise;
      await uploadPromise;
      expect(events.indexOf('reindex-add')).toBeGreaterThanOrEqual(0);
      expect(events.indexOf('upload-add')).toBeGreaterThan(events.indexOf('reindex-add'));
    } finally {
      releasePreparation();
      await rm(root, { recursive: true, force: true });
    }
  });
});
