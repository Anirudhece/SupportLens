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

  it('does not take over an expired lock while its same-host owner is alive', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-lock-lease-'));
    const registryPath = path.join(root, 'documents.json');
    const lockPath = `${registryPath}.local.lock`;
    try {
      await writeFile(registryPath, JSON.stringify({ documents: [] }), 'utf8');
      const registry = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 100, lockRetryMs: 5, lockLeaseMs: 1000, lockHeartbeatMs: 20 });
      const contender = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 30, lockRetryMs: 5, lockLeaseMs: 1000, lockHeartbeatMs: 20 });
      let release;
      let releaseReady;
      const releaseReadyGate = new Promise((resolve) => { releaseReady = resolve; });
      const held = registry.withTargetLock('local', async () => {
        const owner = JSON.parse(await readFile(path.join(lockPath, 'owner.json'), 'utf8'));
        await writeFile(path.join(lockPath, 'owner.json'), JSON.stringify({ ...owner, expiresAt: Date.now() - 1 }), 'utf8');
        await expect(contender.withTargetLock('local', async () => {})).rejects.toMatchObject({ code: 'registry_lock_timeout' });
        await new Promise((resolve) => { release = resolve; releaseReady(); });
      });
      await releaseReadyGate;
      release();
      await held;
      await expect(contender.withTargetLock('local', async () => 'recovered')).resolves.toBe('recovered');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('recovers a registry lock left by an expired owner', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-registry-lock-lease-'));
    const registryPath = path.join(root, 'documents.json');
    const lockPath = `${registryPath}.lock`;
    try {
      await writeFile(registryPath, JSON.stringify({ documents: [] }), 'utf8');
      await mkdir(lockPath);
      await writeFile(path.join(lockPath, 'owner.json'), JSON.stringify({ ownerId: 'abandoned', expiresAt: Date.now() - 1 }), 'utf8');
      await writeFile(path.join(lockPath, 'owner.json.heartbeat.tmp'), '{"ownerId":"abandoned"}', 'utf8');
      const registry = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 100, lockRetryMs: 5, lockLeaseMs: 1000, lockHeartbeatMs: 20 });
      await expect(registry.add({ id: 'recovered' })).resolves.toMatchObject({ id: 'recovered' });
      expect(await readdir(root)).toEqual(['documents.json']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows only one contender into a stale-lock recovery at a time', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-lock-contenders-'));
    const registryPath = path.join(root, 'documents.json');
    const lockPath = `${registryPath}.local.lock`;
    try {
      await writeFile(registryPath, JSON.stringify({ documents: [] }), 'utf8');
      await mkdir(lockPath);
      await writeFile(path.join(lockPath, 'owner.json'), JSON.stringify({ ownerId: 'dead-owner', pid: 2147483647, expiresAt: Date.now() - 1 }), 'utf8');
      const options = { path: registryPath, lockTimeoutMs: 500, lockRetryMs: 5, lockLeaseMs: 1000, lockHeartbeatMs: 20 };
      const firstRegistry = createDocumentRegistry(options);
      const secondRegistry = createDocumentRegistry(options);
      let active = 0;
      let maximumActive = 0;
      let callbacks = 0;
      let releaseFirst;
      let firstStarted;
      const firstStartedGate = new Promise((resolve) => { firstStarted = resolve; });
      const run = async () => {
        callbacks += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (callbacks === 1) {
          firstStarted();
          await new Promise((resolve) => { releaseFirst = resolve; });
        }
        active -= 1;
      };
      const first = firstRegistry.withTargetLock('local', run);
      const second = secondRegistry.withTargetLock('local', run);
      await firstStartedGate;
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(callbacks).toBe(1);
      expect(maximumActive).toBe(1);
      releaseFirst();
      await Promise.all([first, second]);
      expect(callbacks).toBe(2);
      expect(maximumActive).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not let a delayed stale contender claim a newer owner', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-lock-delayed-'));
    const registryPath = path.join(root, 'documents.json');
    const lockPath = `${registryPath}.local.lock`;
    try {
      await writeFile(registryPath, JSON.stringify({ documents: [] }), 'utf8');
      const oldOwner = { ownerId: 'old-owner', pid: 2147483647, expiresAt: Date.now() - 10000 };
      await mkdir(lockPath);
      await writeFile(path.join(lockPath, 'owner.json'), JSON.stringify(oldOwner), 'utf8');
      await writeFile(path.join(lockPath, `owner-${oldOwner.ownerId}.json`), JSON.stringify(oldOwner), 'utf8');
      const first = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 500, lockRetryMs: 5, lockLeaseMs: 1000, lockHeartbeatMs: 20, staleRecoveryDelayMs: 50 });
      const second = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 500, lockRetryMs: 5, lockLeaseMs: 1000, lockHeartbeatMs: 20 });
      let releaseSecond;
      let secondStarted;
      const secondStartedGate = new Promise((resolve) => { secondStarted = resolve; });
      let callbacks = 0;
      let active = 0;
      let maximumActive = 0;
      const firstPromise = first.withTargetLock('local', async () => {
        callbacks += 1; active += 1; maximumActive = Math.max(maximumActive, active);
        active -= 1;
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const secondPromise = second.withTargetLock('local', async () => {
        callbacks += 1; active += 1; maximumActive = Math.max(maximumActive, active); secondStarted();
        await new Promise((resolve) => { releaseSecond = resolve; });
        active -= 1;
      });
      await secondStartedGate;
      await new Promise((resolve) => setTimeout(resolve, 70));
      expect(callbacks).toBe(1);
      expect(maximumActive).toBe(1);
      releaseSecond();
      await Promise.all([firstPromise, secondPromise]);
      expect(callbacks).toBe(2);
      expect(maximumActive).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not let a delayed legacy contender claim a newer owner', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-lock-delayed-legacy-'));
    const registryPath = path.join(root, 'documents.json');
    const lockPath = `${registryPath}.local.lock`;
    try {
      await writeFile(registryPath, JSON.stringify({ documents: [] }), 'utf8');
      const oldOwner = { ownerId: 'legacy-old-owner', pid: 2147483647, expiresAt: Date.now() - 10000 };
      await mkdir(lockPath);
      await writeFile(path.join(lockPath, 'owner.json'), JSON.stringify(oldOwner), 'utf8');
      const first = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 500, lockRetryMs: 5, lockLeaseMs: 1000, lockHeartbeatMs: 20, staleRecoveryDelayMs: 50 });
      const second = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 500, lockRetryMs: 5, lockLeaseMs: 1000, lockHeartbeatMs: 20 });
      let releaseSecond;
      let secondStarted;
      const secondStartedGate = new Promise((resolve) => { secondStarted = resolve; });
      let callbacks = 0;
      let active = 0;
      let maximumActive = 0;
      const firstPromise = first.withTargetLock('local', async () => {
        callbacks += 1; active += 1; maximumActive = Math.max(maximumActive, active);
        active -= 1;
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const secondPromise = second.withTargetLock('local', async () => {
        callbacks += 1; active += 1; maximumActive = Math.max(maximumActive, active); secondStarted();
        await new Promise((resolve) => { releaseSecond = resolve; });
        active -= 1;
      });
      await secondStartedGate;
      await new Promise((resolve) => setTimeout(resolve, 70));
      expect(callbacks).toBe(1);
      expect(maximumActive).toBe(1);
      releaseSecond();
      await Promise.all([firstPromise, secondPromise]);
      expect(callbacks).toBe(2);
      expect(maximumActive).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps a newer owner safe from two delayed legacy contenders', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-lock-two-delayed-legacy-'));
    const registryPath = path.join(root, 'documents.json');
    const lockPath = `${registryPath}.local.lock`;
    try {
      await writeFile(registryPath, JSON.stringify({ documents: [] }), 'utf8');
      const oldOwner = { ownerId: 'legacy-old-owner', pid: 2147483647, expiresAt: Date.now() - 10000 };
      await mkdir(lockPath);
      await writeFile(path.join(lockPath, 'owner.json'), JSON.stringify(oldOwner), 'utf8');
      const delayedOptions = { path: registryPath, lockTimeoutMs: 1000, lockRetryMs: 5, lockLeaseMs: 1000, lockHeartbeatMs: 20, staleRecoveryDelayMs: 50 };
      const first = createDocumentRegistry(delayedOptions);
      const second = createDocumentRegistry(delayedOptions);
      const newer = createDocumentRegistry({ ...delayedOptions, staleRecoveryDelayMs: 0 });
      let releaseNewer;
      let newerStarted;
      const newerStartedGate = new Promise((resolve) => { newerStarted = resolve; });
      let callbacks = 0;
      let active = 0;
      let maximumActive = 0;
      const runDelayed = async () => {
        callbacks += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        active -= 1;
      };
      const firstPromise = first.withTargetLock('local', runDelayed);
      const secondPromise = second.withTargetLock('local', runDelayed);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const newerPromise = newer.withTargetLock('local', async () => {
        callbacks += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        newerStarted();
        await new Promise((resolve) => { releaseNewer = resolve; });
        active -= 1;
      });
      await newerStartedGate;
      await new Promise((resolve) => setTimeout(resolve, 70));
      expect(callbacks).toBe(1);
      expect(maximumActive).toBe(1);
      releaseNewer();
      await Promise.all([firstPromise, secondPromise, newerPromise]);
      expect(callbacks).toBe(3);
      expect(maximumActive).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('recovers an ancient expired lock even when its PID is now live', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-lock-pid-reuse-'));
    const registryPath = path.join(root, 'documents.json');
    const lockPath = `${registryPath}.lock`;
    try {
      await writeFile(registryPath, JSON.stringify({ documents: [] }), 'utf8');
      const owner = { ownerId: 'reused-pid-owner', pid: process.pid, expiresAt: Date.now() - 1000 };
      await mkdir(lockPath);
      await writeFile(path.join(lockPath, 'owner.json'), JSON.stringify(owner), 'utf8');
      await writeFile(path.join(lockPath, `owner-${owner.ownerId}.json`), JSON.stringify(owner), 'utf8');
      const registry = createDocumentRegistry({ path: registryPath, lockTimeoutMs: 100, lockRetryMs: 5, lockLeaseMs: 1000, lockPidGraceMs: 50, lockHeartbeatMs: 20 });
      await expect(registry.add({ id: 'recovered-after-pid-reuse' })).resolves.toMatchObject({ id: 'recovered-after-pid-reuse' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('limits rollback history and reports only evicted non-fixed collections', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'supportlens-history-'));
    const registryPath = path.join(root, 'documents.json');
    try {
      await writeFile(registryPath, JSON.stringify({ documents: [], collections: { local: { active: 'supportlens_m2_local', history: ['old-5', 'old-4', 'old-3', 'old-2', 'old-1'] } } }), 'utf8');
      const registry = createDocumentRegistry({ path: registryPath });
      const result = await registry.activateCollectionAndUpdateChunking('local', 'candidate-1', []);
      expect(result.evictedCollections).toEqual(['old-1']);
      const state = JSON.parse(await readFile(registryPath, 'utf8'));
      expect(state.collections.local.active).toBe('candidate-1');
      expect(state.collections.local.history).toHaveLength(5);
      expect(state.collections.local.history).toContain('supportlens_m2_local');
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
