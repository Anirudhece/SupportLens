const M1_COLLECTIONS = { local: 'supportlens_m1_local', cloud: 'supportlens_m1_cloud' };
const COLLECTIONS = { local: 'supportlens_m2_local', cloud: 'supportlens_m2_cloud' };

export function createChromaRepository({ clients, collectionNames = COLLECTIONS }) {
  const collectionCache = new Map();
  async function collection(target) {
    const client = clients[target];
    if (!client) throw Object.assign(new Error('Selected Chroma target is unavailable.'), { code: 'target_unavailable' });
    if (!collectionCache.has(target)) {
      collectionCache.set(target, client.getOrCreateCollection({ name: collectionNames[target], configuration: { hnsw: { space: 'cosine' } } }));
    }
    return collectionCache.get(target);
  }
  return {
    async addChunks(target, chunks) {
      const col = await collection(target);
      if (!chunks.length) return;
      await col.add({
        ids: chunks.map((chunk) => chunk.id),
        documents: chunks.map((chunk) => chunk.content),
        embeddings: chunks.map((chunk) => chunk.embedding),
        metadatas: chunks.map((chunk) => chunk.metadata)
      });
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
    async count(target) {
      const col = await collection(target);
      return col.count();
    },
    async deleteCollection(target) {
      const client = clients[target];
      if (!client) return;
      try {
        await client.deleteCollection({ name: collectionNames[target] });
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
      collectionCache.delete(target);
    }
  };
}

export { COLLECTIONS };
export { M1_COLLECTIONS };
