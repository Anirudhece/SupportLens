export function createRetrievalService({ embeddings, repository, config }) {
  return {
    async retrieve({ question, target, nResults = config.rag.retrievalK }) {
      const started = performance.now();
      const boundedResults = Number.isInteger(Number(nResults))
        ? Math.min(10, Math.max(1, Number(nResults)))
        : config.rag.retrievalK;
      await embeddings.prepare?.();
      const embeddingStarted = performance.now();
      const [queryEmbedding] = await embeddings.embed([question]);
      const queryStarted = performance.now();
      const results = await repository.query(target, queryEmbedding, boundedResults);
      return {
        question,
        target,
        results,
        latencyMs: Math.round((performance.now() - started) * 100) / 100,
        embeddingLatencyMs: Math.round((queryStarted - embeddingStarted) * 100) / 100,
        queryLatencyMs: Math.round((performance.now() - queryStarted) * 100) / 100,
        embeddingModel: embeddings.model
      };
    }
  };
}
