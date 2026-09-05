import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDocumentRegistry } from '../src/services/documentRegistry.js';

describe('document registry concurrency', () => {
  it('preserves an external registry update made between list and updateChunking', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-registry-concurrency-'));
    const registryPath = path.join(root, 'documents.json');
    try {
      await writeFile(registryPath, `${JSON.stringify({ documents: [{ id: 'doc-1', target: 'local', chunkCount: 1 }] })}\n`, 'utf8');
      const registry = createDocumentRegistry({ path: registryPath });
      await registry.list('local');
      await writeFile(registryPath, `${JSON.stringify({ documents: [{ id: 'doc-1', target: 'local', chunkCount: 1 }, { id: 'external', target: 'local', chunkCount: 7 }] })}\n`, 'utf8');
      await registry.updateChunking([{ id: 'doc-1', chunkCount: 4, chunkingVersion: 'm2-heading-aware-240-15' }]);
      expect(JSON.parse(await readFile(registryPath, 'utf8'))).toEqual({
        documents: [
          { id: 'doc-1', target: 'local', chunkCount: 4, chunkingVersion: 'm2-heading-aware-240-15' },
          { id: 'external', target: 'local', chunkCount: 7 }
        ]
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed on a held lock and leaves the foreign lock intact', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-registry-lock-'));
    const registryPath = path.join(root, 'documents.json');
    const lockPath = `${registryPath}.lock`;
    try {
      await writeFile(registryPath, JSON.stringify({ documents: [] }), 'utf8');
      await mkdir(lockPath);
      await expect(createDocumentRegistry({ path: registryPath, lockTimeoutMs: 50, lockRetryMs: 5 }).add({ id: 'doc-1' }))
        .rejects.toMatchObject({ code: 'registry_lock_timeout' });
      expect(await readdir(root)).toContain('documents.json.lock');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 1000);
});
