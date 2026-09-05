import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REGISTRY_LOCK_TIMEOUT_MS = 5000;
const REGISTRY_LOCK_RETRY_MS = 25;

export function documentChecksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function createDocumentRegistry({ path: registryPath, lockTimeoutMs = REGISTRY_LOCK_TIMEOUT_MS, lockRetryMs = REGISTRY_LOCK_RETRY_MS }) {
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

  async function acquireLock(lockPath, description) {
    await mkdir(path.dirname(registryPath), { recursive: true });
    const deadline = Date.now() + lockTimeoutMs;
    while (true) {
      try {
        await mkdir(lockPath);
        return;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) {
          const lockError = new Error(`Timed out waiting for the ${description} lock: ${lockPath}`);
          lockError.code = 'registry_lock_timeout';
          throw lockError;
        }
        await new Promise((resolve) => setTimeout(resolve, lockRetryMs));
      }
    }
  }

  async function releaseLock(lockPath) {
    await rmdir(lockPath);
  }

  async function withLock(mutator) {
    await acquireLock(registryLockPath, 'document registry');
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
        await releaseLock(registryLockPath);
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
      await acquireLock(lockPath, `${target} target operation`);
      let operationError;
      try {
        return await callback();
      } catch (error) {
        operationError = error;
        throw error;
      } finally {
        try {
          await releaseLock(lockPath);
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
