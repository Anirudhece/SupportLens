import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REGISTRY_LOCK_TIMEOUT_MS = 5000;
const REGISTRY_LOCK_RETRY_MS = 25;
const LOCK_LEASE_MS = 5000;
const LOCK_HEARTBEAT_MS = 1000;
const DEFAULT_COLLECTIONS = { local: 'supportlens_m2_local', cloud: 'supportlens_m2_cloud' };

export function documentChecksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function createDocumentRegistry({
  path: registryPath,
  lockTimeoutMs = REGISTRY_LOCK_TIMEOUT_MS,
  lockRetryMs = REGISTRY_LOCK_RETRY_MS,
  lockLeaseMs = LOCK_LEASE_MS,
  lockHeartbeatMs = LOCK_HEARTBEAT_MS,
  lockPidGraceMs = lockLeaseMs,
  staleRecoveryDelayMs = 0,
  defaultCollections = DEFAULT_COLLECTIONS
}) {
  if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs <= 0) throw new Error('lockTimeoutMs must be a positive integer.');
  if (!Number.isInteger(lockRetryMs) || lockRetryMs <= 0) throw new Error('lockRetryMs must be a positive integer.');
  if (!Number.isInteger(lockLeaseMs) || lockLeaseMs <= 0) throw new Error('lockLeaseMs must be a positive integer.');
  if (!Number.isInteger(lockHeartbeatMs) || lockHeartbeatMs <= 0 || lockHeartbeatMs >= lockLeaseMs) throw new Error('lockHeartbeatMs must be a positive integer smaller than lockLeaseMs.');
  if (!Number.isInteger(lockPidGraceMs) || lockPidGraceMs <= 0) throw new Error('lockPidGraceMs must be a positive integer.');
  if (!Number.isInteger(staleRecoveryDelayMs) || staleRecoveryDelayMs < 0) throw new Error('staleRecoveryDelayMs must be a non-negative integer.');
  let cache;
  const registryLockPath = `${registryPath}.lock`;

  function targetLockPath(target) {
    if (target !== 'local' && target !== 'cloud') {
      const error = new Error('Registry operation target must be local or cloud.');
      error.code = 'invalid_target';
      throw error;
    }
    return `${registryPath}.${target}.lock`;
  }

  async function readLatest({ updateCache = true } = {}) {
    let state;
    try { state = JSON.parse(await readFile(registryPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = { documents: [] }; }
    if (updateCache) cache = state;
    return state;
  }
  async function save(state) {
    const directory = path.dirname(registryPath);
    const temporaryPath = path.join(directory, `.${path.basename(registryPath)}.${process.pid}.${randomUUID()}.tmp`);
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      await rename(temporaryPath, registryPath);
    } catch (error) {
      try {
        await unlink(temporaryPath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError;
      }
      throw error;
    }
  }

  async function readLockOwner(lockPath) {
    try { return JSON.parse(await readFile(path.join(lockPath, 'owner.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
  }

  async function writeLockOwner(lockPath, owner) {
    const ownerPath = path.join(lockPath, 'owner.json');
    const temporaryPath = `${ownerPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(owner)}\n`, 'utf8');
      await rename(temporaryPath, ownerPath);
    } catch (error) {
      await unlink(temporaryPath).catch((cleanupError) => { if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError; });
      throw error;
    }
  }

  async function writeOwnerMarker(lockPath, owner) {
    await writeFile(path.join(lockPath, `owner-${owner.ownerId}.json`), `${JSON.stringify(owner)}\n`, 'utf8');
  }

  async function staleOwnerSnapshot(lockPath) {
    const owner = await readLockOwner(lockPath);
    if (owner) {
      const now = Date.now();
      if (!Number.isFinite(owner.expiresAt) || owner.expiresAt > now) return null;
      if (Number.isInteger(owner.pid) && owner.pid > 0) {
        if (now - owner.expiresAt <= lockPidGraceMs) {
          try {
            process.kill(owner.pid, 0);
            return null;
          } catch (error) {
            if (error.code === 'EPERM') return null;
            if (error.code !== 'ESRCH') throw error;
          }
        }
      }
      return owner;
    }
    try {
      const details = await stat(lockPath);
      return details.mtimeMs + lockLeaseMs <= Date.now() ? { ownerless: true } : null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function recoverStaleLock(lockPath, observedOwner) {
    const markerPath = path.join(lockPath, `owner-${observedOwner.ownerId}.json`);
    const claimPath = `${lockPath}.stale-owner-${observedOwner.ownerId}-${process.pid}-${randomUUID()}`;
    try {
      // Claim the immutable marker for the exact stale owner snapshot. A
      // delayed contender cannot claim a newer owner's marker after takeover.
      await rename(markerPath, claimPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Legacy locks have only owner.json. Upgrade by creating the exact
      // immutable marker exclusively; never rename owner.json after a reread.
      // The next acquisition loop will claim this marker atomically.
      try {
        await writeFile(markerPath, `${JSON.stringify(observedOwner)}\n`, { encoding: 'utf8', flag: 'wx' });
      } catch (upgradeError) {
        if (upgradeError.code === 'EEXIST' || upgradeError.code === 'ENOENT') return false;
        throw upgradeError;
      }
      const current = await readLockOwner(lockPath);
      if (current?.ownerId !== observedOwner.ownerId) {
        await unlink(markerPath).catch((cleanupError) => { if (cleanupError.code !== 'ENOENT') throw cleanupError; });
      }
      return false;
    }
    try {
      const current = await readLockOwner(lockPath);
      if (current?.ownerId !== observedOwner.ownerId) {
        // The marker was claimed, but the lock path now belongs to a newer
        // owner. Only discard our claim; never remove the newer lock.
        await rm(claimPath, { force: true }).catch(() => {});
        return false;
      }
      // Move the claimed lock directory away atomically before removing it.
      // This prevents a contender from publishing a new lock at lockPath
      // while recursive cleanup is still traversing the old directory.
      const retiredPath = `${lockPath}.stale-lock-${observedOwner.ownerId}-${process.pid}-${randomUUID()}`;
      try {
        await rename(lockPath, retiredPath);
      } catch (renameError) {
        if (renameError.code === 'ENOENT') return false;
        throw renameError;
      }
      await rm(retiredPath, { recursive: true, force: true });
    } finally {
      await rm(claimPath, { force: true }).catch(() => {});
    }
    return true;
  }

  async function recoverOwnerlessLock(lockPath) {
    try {
      await rmdir(lockPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTEMPTY') return false;
      throw error;
    }
  }

  async function acquireLock(lockPath, description) {
    await mkdir(path.dirname(registryPath), { recursive: true });
    const deadline = Date.now() + lockTimeoutMs;
    while (true) {
      const owner = { ownerId: randomUUID(), pid: process.pid, acquiredAt: Date.now(), expiresAt: Date.now() + lockLeaseMs };
      const stagingPath = `${lockPath}.staging-${process.pid}-${randomUUID()}`;
      try {
        // Publish only a fully initialized lock. A crash before rename leaves
        // an unreferenced staging directory, never an ownerless live lock.
        await mkdir(stagingPath);
        await writeLockOwner(stagingPath, owner);
        await writeOwnerMarker(stagingPath, owner);
        // Node can replace an empty directory on some platforms. Check first
        // so a legacy/ownerless lock directory remains a contention signal;
        // the final rename is still the atomic publication when absent.
        try {
          await stat(lockPath);
          const occupied = new Error('Lock path is already occupied.');
          occupied.code = 'EEXIST';
          throw occupied;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          await rename(stagingPath, lockPath);
        }
        let heartbeatPromise = Promise.resolve();
        const heartbeat = setInterval(() => {
          heartbeatPromise = heartbeatPromise.then(async () => {
            try {
              const current = await readLockOwner(lockPath);
              if (current?.ownerId === owner.ownerId) {
                await writeLockOwner(lockPath, { ...owner, expiresAt: Date.now() + lockLeaseMs });
              }
            } catch { /* A lost lock must not make the protected operation fail asynchronously. */ }
          });
        }, lockHeartbeatMs);
        heartbeat.unref?.();
        return { lockPath, owner, heartbeat, heartbeatDone: () => heartbeatPromise };
      } catch (error) {
        await rm(stagingPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 5 }).catch(() => {});
        if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
        const observed = await staleOwnerSnapshot(lockPath);
        if (observed) {
          if (staleRecoveryDelayMs) await new Promise((resolve) => setTimeout(resolve, staleRecoveryDelayMs));
          if (observed.ownerless) await recoverOwnerlessLock(lockPath);
          else await recoverStaleLock(lockPath, observed);
          continue;
        }
        if (Date.now() >= deadline) {
          const lockError = new Error(`Timed out waiting for the ${description} lock: ${lockPath}`);
          lockError.code = 'registry_lock_timeout';
          throw lockError;
        }
        await new Promise((resolve) => setTimeout(resolve, lockRetryMs));
      }
    }
  }

  async function releaseLock(lock) {
    clearInterval(lock.heartbeat);
    await lock.heartbeatDone();
    const markerPath = path.join(lock.lockPath, `owner-${lock.owner.ownerId}.json`);
    const releaseClaimPath = `${lock.lockPath}.release-owner-${lock.owner.ownerId}-${process.pid}-${randomUUID()}`;
    try {
      // Claim the immutable marker before removing the directory. A stale
      // taker must claim this marker first, so one of the two operations wins
      // atomically and the loser cannot delete the winner's lock.
      await rename(markerPath, releaseClaimPath);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    try {
      const current = await readLockOwner(lock.lockPath);
      if (!current || current.ownerId !== lock.owner.ownerId) return;
      const retiredPath = `${lock.lockPath}.released-${lock.owner.ownerId}-${process.pid}-${randomUUID()}`;
      try {
        await rename(lock.lockPath, retiredPath);
      } catch (renameError) {
        if (renameError.code === 'ENOENT') return;
        throw renameError;
      }
      await rm(retiredPath, { recursive: true, force: true });
    } finally {
      await rm(releaseClaimPath, { force: true }).catch(() => {});
    }
  }

  async function withLock(mutator) {
    const lock = await acquireLock(registryLockPath, 'document registry');
    let operationError;
    try {
      const state = await readLatest({ updateCache: false });
      const { result, changed = true } = await mutator(state);
      if (changed) await save(state);
      cache = state;
      return result;
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      try {
        await releaseLock(lock);
      } catch (cleanupError) {
        if (operationError) {
          operationError.lockCleanupError = cleanupError;
        } else {
          throw cleanupError;
        }
      }
    }
  }

  return {
    async withTargetLock(target, callback) {
      const lockPath = targetLockPath(target);
      const lock = await acquireLock(lockPath, `${target} target operation`);
      let operationError;
      try {
        return await callback();
      } catch (error) {
        operationError = error;
        throw error;
      } finally {
        try {
          await releaseLock(lock);
        } catch (cleanupError) {
          if (operationError) {
            operationError.targetLockCleanupError = cleanupError;
          } else {
            throw cleanupError;
          }
        }
      }
    },
    async list(target) { const state = await readLatest(); return state.documents.filter((doc) => !target || doc.target === target); },
    async getActiveCollection(target, fallback = defaultCollections[target]) {
      if (target !== 'local' && target !== 'cloud') throw new Error('Registry operation target must be local or cloud.');
      const state = await readLatest();
      return state.collections?.[target]?.active || fallback;
    },
    async findByChecksum(checksum, target) { return (await this.list(target)).find((doc) => doc.checksum === checksum); },
    async add(document) {
      return withLock((state) => {
        state.documents.push(document);
        return { result: document };
      });
    },
    async update(id, patch) {
      return withLock((state) => {
        const doc = state.documents.find((item) => item.id === id);
        if (!doc) return { result: null, changed: false };
        Object.assign(doc, patch);
        return { result: doc };
      });
    },
    async updateChunking(updates) {
      return withLock((state) => {
        const updateMap = new Map(updates.map((update) => [update.id, update]));
        const documentsById = new Map(state.documents.map((document) => [document.id, document]));
        if ([...updateMap.keys()].some((id) => !documentsById.has(id))) {
          throw new Error('Registry changed while rebuilding the selected collection.');
        }
        const updated = [...updateMap.values()].map((update) => {
          const document = documentsById.get(update.id);
          Object.assign(document, {
            chunkCount: update.chunkCount,
            ...(update.chunkingVersion ? { chunkingVersion: update.chunkingVersion } : {})
          });
          return document;
        });
        return { result: updated, changed: updated.length > 0 };
      });
    },
    async activateCollectionAndUpdateChunking(target, collectionName, updates, fallback = defaultCollections[target]) {
      if (target !== 'local' && target !== 'cloud') throw new Error('Registry operation target must be local or cloud.');
      return withLock((state) => {
        const updateMap = new Map(updates.map((update) => [update.id, update]));
        const documentsById = new Map(state.documents.map((document) => [document.id, document]));
        if ([...updateMap.keys()].some((id) => !documentsById.has(id) || documentsById.get(id).target !== target)) {
          throw new Error('Registry changed while activating the rebuilt collection.');
        }
        state.collections = state.collections || {};
        const previous = state.collections[target]?.active || fallback;
        const history = state.collections[target]?.history || [];
        const nextHistory = previous === collectionName
          ? history.slice(0, 5)
          : [previous, ...history.filter((name) => name !== previous)];
        const evictedCollections = nextHistory.slice(5).filter((name) => name !== fallback);
        state.collections[target] = {
          active: collectionName,
          history: nextHistory.slice(0, 5)
        };
        const updated = [...updateMap.values()].map((update) => {
          const document = documentsById.get(update.id);
          Object.assign(document, { chunkCount: update.chunkCount, ...(update.chunkingVersion ? { chunkingVersion: update.chunkingVersion } : {}) });
          return document;
        });
        return { result: { documents: updated, evictedCollections } };
      });
    }
  };
}

export async function persistUpload({ buffer, uploadDir, filename }) {
  const targetDir = path.resolve(uploadDir);
  await mkdir(targetDir, { recursive: true });
  const target = path.join(targetDir, filename);
  await writeFile(target, buffer);
  return target;
}
