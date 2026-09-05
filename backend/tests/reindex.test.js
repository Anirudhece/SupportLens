import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { reindexDocuments } from '../scripts/reindex.js';
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
    expect(repository.deleteCollection).toHaveBeenCalledOnce();
    expect(repository.addChunks).toHaveBeenCalledOnce();
    expect(repository.addChunks.mock.calls[0][0]).toBe('local');
    expect(repository.addChunks.mock.calls[0][1][0]).toMatchObject({
      id: 'local-doc-0',
      metadata: {
        documentId: 'local-doc', source: 'billing.md', checksum: 'abc', version: 3, page: 2, section: 'Billing'
      }
    });
    expect(registry.updateChunking).toHaveBeenCalledOnce();
    expect(registry.updateChunking).toHaveBeenCalledWith([
      { id: 'local-doc', chunkCount: 1, chunkingVersion: 'm2-heading-aware-240-15' }
    ]);
    expect(result).toMatchObject({ target: 'local', documents: 1, chunks: 1, collection: 'supportlens_m2_local' });
  });

  it('cleans the selected M2 collection when verification fails before registry update', async () => {
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

    expect(repository.deleteCollection).toHaveBeenCalledTimes(2);
    expect(registry.updateChunking).not.toHaveBeenCalled();
  });

  it('surfaces a cleanup failure together with the original reindex failure', async () => {
    const registry = makeRegistry([{ id: 'local-doc', target: 'local', name: 'billing.md', checksum: 'abc', version: 1, status: 'ready', storedPath: '/tmp/billing.md' }]);
    const repository = makeRepository(0);
    repository.deleteCollection
      .mockResolvedValueOnce()
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
    expect(repository.deleteCollection).toHaveBeenCalledTimes(2);
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
