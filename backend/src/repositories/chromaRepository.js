const COLLECTIONS = { local: 'supportlens_m1_local', cloud: 'supportlens_m1_cloud' };

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
    async deleteCollection(target) {
      const client = clients[target];
      if (!client) return;
      await client.deleteCollection({ name: collectionNames[target] });
      collectionCache.delete(target);
    }
  };
}

export { COLLECTIONS };
