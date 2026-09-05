import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDocumentRegistry } from '../src/services/documentRegistry.js';

describe('document registry persistence', () => {
  it('atomically persists complete chunking metadata without leaving a temp file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-registry-'));
    const registryPath = path.join(root, 'documents.json');
    try {
      await writeFile(registryPath, `${JSON.stringify({ documents: [{ id: 'doc-1', target: 'local', chunkCount: 1 }] })}\n`, 'utf8');
      const registry = createDocumentRegistry({ path: registryPath });
      await registry.updateChunking([{ id: 'doc-1', chunkCount: 4, chunkingVersion: 'm2-heading-aware-240-15' }]);
      const persisted = JSON.parse(await readFile(registryPath, 'utf8'));
      expect(persisted).toEqual({ documents: [{ id: 'doc-1', target: 'local', chunkCount: 4, chunkingVersion: 'm2-heading-aware-240-15' }] });
      expect(await readdir(root)).toEqual(['documents.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves an external registry update between list and updateChunking', async () => {
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
      expect(await readdir(root)).toEqual(['documents.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('cleans the registry lock after successful and failed mutations', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-registry-lock-cleanup-'));
    const registryPath = path.join(root, 'documents.json');
    try {
      await writeFile(registryPath, JSON.stringify({ documents: [{ id: 'doc-1' }] }), 'utf8');
      const registry = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 100, lockRetryMs: 5 });
      await registry.update('doc-1', { chunkCount: 2 });
      expect(await readdir(root)).toEqual(['documents.json']);
      await expect(registry.updateChunking([{ id: 'missing', chunkCount: 3 }]))
        .rejects.toThrow('Registry changed');
      expect(await readdir(root)).toEqual(['documents.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed quickly when another process holds the lock', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-registry-lock-held-'));
    const registryPath = path.join(root, 'documents.json');
    const lockPath = `${registryPath}.lock`;
    try {
      await writeFile(registryPath, JSON.stringify({ documents: [] }), 'utf8');
      await mkdir(lockPath);
      const registry = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 50, lockRetryMs: 5 });
      await expect(registry.add({ id: 'doc-1' })).rejects.toMatchObject({ code: 'registry_lock_timeout' });
      expect(await readdir(root)).toContain('documents.json.lock');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps local and cloud target locks independent', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-target-locks-'));
    const registryPath = path.join(root, 'documents.json');
    let releaseLocal;
    let localStarted;
    const localGate = new Promise((resolve) => { releaseLocal = resolve; });
    const localStartedGate = new Promise((resolve) => { localStarted = resolve; });
    try {
      await writeFile(registryPath, JSON.stringify({ documents: [] }), 'utf8');
      const registry = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 200, lockRetryMs: 5 });
      const localPromise = registry.withTargetLock('local', async () => {
        localStarted();
        await localGate;
        return 'local';
      });
      await localStartedGate;
      await expect(registry.withTargetLock('cloud', async () => 'cloud')).resolves.toBe('cloud');
      releaseLocal();
      await expect(localPromise).resolves.toBe('local');
    } finally {
      releaseLocal();
      await rm(root, { recursive: true, force: true });
    }
  });
});
