const M1_COLLECTIONS = { local: 'supportlens_m1_local', cloud: 'supportlens_m1_cloud' };
const COLLECTIONS = { local: 'supportlens_m2_local', cloud: 'supportlens_m2_cloud' };

export function createChromaRepository({ clients, collectionNames = COLLECTIONS, registry }) {
  const collectionCache = new Map();
  async function activeName(target) {
    if (registry?.getActiveCollection) return registry.getActiveCollection(target, collectionNames[target]);
    return collectionNames[target];
  }
  async function collection(target, collectionName) {
    const client = clients[target];
    if (!client) throw Object.assign(new Error('Selected Chroma target is unavailable.'), { code: 'target_unavailable' });
    const name = collectionName || await activeName(target);
    const cacheKey = `${target}:${name}`;
    if (!collectionCache.has(cacheKey)) {
      let pending;
      try {
        pending = client.getOrCreateCollection({ name, configuration: { hnsw: { space: 'cosine' } } });
      } catch (error) {
        throw error;
      }
      const recoverable = Promise.resolve(pending).catch((error) => {
        collectionCache.delete(cacheKey);
        throw error;
      });
      collectionCache.set(cacheKey, recoverable);
    }
    return collectionCache.get(cacheKey);
  }
  async function addBatch(target, chunks, collectionName) {
    if (!chunks.length) return;
    const col = await collection(target, collectionName);
    await col.add({
      ids: chunks.map((chunk) => chunk.id),
      documents: chunks.map((chunk) => chunk.content),
      embeddings: chunks.map((chunk) => chunk.embedding),
      metadatas: chunks.map((chunk) => chunk.metadata)
    });
  }
  const maxDefaultBatchSize = 64;
  return {
    async addChunks(target, chunks, { collectionName, batchSize = maxDefaultBatchSize } = {}) {
      if (!chunks.length) return;
      if (!Number.isInteger(batchSize) || batchSize <= 0) throw new Error('batchSize must be a positive integer.');
      const client = clients[target];
      const reportedMax = typeof client?.getMaxBatchSize === 'function' ? await client.getMaxBatchSize() : null;
      const serverMax = Number.isInteger(reportedMax) && reportedMax > 0 ? reportedMax : Number.POSITIVE_INFINITY;
      const boundedSize = Math.min(batchSize, serverMax);
      for (let start = 0; start < chunks.length; start += boundedSize) {
        await addBatch(target, chunks.slice(start, start + boundedSize), collectionName);
      }
    },
    async query(target, embedding, nResults = 4) {
      const col = await collection(target);
      const result = await col.query({ queryEmbeddings: [embedding], nResults });
      return (result.ids?.[0] || []).map((id, index) => ({
        id,
        content: result.documents?.[0]?.[index] || '',
        metadata: result.metadatas?.[0]?.[index] || {},
        distance: result.distances?.[0]?.[index] ?? null,
        score: result.distances?.[0]?.[index] == null ? null : 1 - result.distances[0][index]
      }));
    },
    async count(target, { collectionName } = {}) {
      const col = await collection(target, collectionName);
      return col.count();
    },
    async deleteCollection(target, { collectionName } = {}) {
      const client = clients[target];
      if (!client) return;
      const name = collectionName || await activeName(target);
      try {
        await client.deleteCollection({ name });
      } catch (error) {
        // Reindex is also used to create an M2 collection for the first time.
        // Treat an absent derived collection as an empty starting point while
        // still surfacing connectivity and permission failures.
        const errorName = error?.name || error?.constructor?.name || error?.constructor;
        const notFound = error?.status === 404
          || error?.statusCode === 404
          || errorName === 'NotFoundError'
          || errorName === 'ChromaNotFoundError'
          || error?.message === 'The requested resource could not be found';
        if (!notFound) throw error;
      }
      collectionCache.delete(`${target}:${name}`);
    },
    async getActiveCollectionName(target) {
      return activeName(target);
    }
  };
}

export { COLLECTIONS };
export { M1_COLLECTIONS };
