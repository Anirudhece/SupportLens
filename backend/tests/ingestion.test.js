import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createIngestionService } from '../src/services/ingestionService.js';

describe('document ingestion', () => {
  it('rejects registries without target-scoped locking', () => {
    expect(() => createIngestionService({
      config: { storage: { uploadDir: '/tmp' }, rag: { chunkStrategy: 'heading-aware', chunkTokens: 240, chunkOverlap: 15 } },
      embeddings: {},
      repository: {},
      registry: {}
    })).toThrow('target-scoped operation locking');
  });

  it('creates embeddings, metadata, and idempotent versions', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'supportlens-test-'));
    const registry = {
      findByChecksum: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing', version: 1, duplicate: true }),
      list: vi.fn().mockResolvedValue([{ name: 'guide.md', version: 1 }]),
      add: vi.fn().mockImplementation(async (document) => document),
      withTargetLock: vi.fn((_target, callback) => callback())
    };
    const embeddings = { tokenizer: null, prepare: vi.fn().mockResolvedValue(), embed: vi.fn().mockResolvedValue([[0.1, 0.2]]) };
    const repository = { addChunks: vi.fn().mockResolvedValue() };
    try {
      const ingestion = createIngestionService({
        config: { storage: { uploadDir: tempRoot }, rag: { chunkStrategy: 'heading-aware', chunkTokens: 240, chunkOverlap: 15 } },
        embeddings, repository, registry
      });
      const first = await ingestion.ingest({ buffer: Buffer.from('# Guide\n\nUse the API.'), originalName: 'guide.md', mimeType: 'text/markdown', target: 'local' });
      expect(first.version).toBe(2);
      expect(first.status).toBe('ready');
      expect(repository.addChunks).toHaveBeenCalledOnce();
      expect(repository.addChunks.mock.calls[0][1][0].metadata.version).toBe(2);
      expect(first.chunkingVersion).toBe('m2-heading-aware-240-15');
      const duplicate = await ingestion.ingest({ buffer: Buffer.from('# Guide\n\nUse the API.'), originalName: 'guide.md', mimeType: 'text/markdown', target: 'local' });
      expect(duplicate.duplicate).toBe(true);
      expect(embeddings.embed).toHaveBeenCalledOnce();
      expect(registry.withTargetLock).toHaveBeenCalledTimes(2);
      expect(registry.withTargetLock).toHaveBeenNthCalledWith(1, 'local', expect.any(Function));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
