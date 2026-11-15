export function termsFrom(question) {
  const stopwords = new Set(['what', 'when', 'where', 'which', 'does', 'this', 'that', 'with', 'from', 'about', 'please', 'explain', 'tell', 'how', 'why', 'the', 'and', 'for', 'are']);
  const terms = [...new Set(String(question).match(/[A-Za-z0-9_][A-Za-z0-9_.:-]{2,}/g) || [])].filter((term) => !stopwords.has(term.toLowerCase()));
  return [...terms.filter((term) => /[_:.\-]|\d/.test(term)), ...terms.filter((term) => !/[_:.\-]|\d/.test(term))].slice(0, 8);
}

export function createRetrievalService({ embeddings, repository, config, reranker }) {
  return {
    async retrieve({ question, target, nResults = config.rag.retrievalK, filters = {}, mode = 'vector' }) {
      const retrievalMode = mode === 'reranked' ? 'hybrid' : mode;
      const started = performance.now();
      const boundedResults = Number.isInteger(Number(nResults))
        ? Math.min(10, Math.max(1, Number(nResults)))
        : config.rag.retrievalK;
      await embeddings.prepare?.();
      const embeddingStarted = performance.now();
      const [queryEmbedding] = await embeddings.embed([question]);
      const queryStarted = performance.now();
      const where = Object.keys(filters).length === 1 ? filters : Object.keys(filters).length > 1 ? { $and: Object.entries(filters).map(([key, value]) => ({ [key]: value })) } : undefined;
      const candidateLimit = retrievalMode === 'hybrid' ? Math.min(50, Math.max(boundedResults, boundedResults * 5)) : boundedResults;
      const vectorResults = where
        ? await repository.query(target, queryEmbedding, candidateLimit, { where })
        : await repository.query(target, queryEmbedding, candidateLimit);
      if (retrievalMode === 'hybrid' && typeof repository.keyword !== 'function') {
        throw Object.assign(new Error('Hybrid retrieval is unavailable for this repository.'), { code: 'hybrid_unavailable' });
      }
      if (retrievalMode !== 'hybrid') {
        return {
          question, target, filters, mode: 'vector', results: vectorResults,
          stages: { vector: vectorResults, keyword: [], fused: vectorResults },
          latencyMs: Math.round((performance.now() - started) * 100) / 100,
          embeddingLatencyMs: Math.round((queryStarted - embeddingStarted) * 100) / 100,
          queryLatencyMs: Math.round((performance.now() - queryStarted) * 100) / 100,
          embeddingModel: embeddings.model
        };
      }
      const keywordResults = where
        ? await repository.keyword(target, termsFrom(question), Math.min(20, boundedResults * 5), { where })
        : await repository.keyword(target, termsFrom(question), Math.min(20, boundedResults * 5));
      const byId = new Map(vectorResults.map((item) => [item.id, item]));
      for (const item of keywordResults) if (!byId.has(item.id)) byId.set(item.id, item);
      const fusedCandidates = [...byId.values()].map((item) => {
        const vectorRank = vectorResults.findIndex((candidate) => candidate.id === item.id);
        const keywordRank = keywordResults.findIndex((candidate) => candidate.id === item.id);
        const fusionScore = (vectorRank >= 0 ? 1 / (60 + vectorRank + 1) : 0) + (keywordRank >= 0 ? 1 / (60 + keywordRank + 1) : 0);
        return { ...item, fusionScore, ...(vectorRank >= 0 ? { vectorRank: vectorRank + 1 } : {}), ...(keywordRank >= 0 ? { keywordRank: keywordRank + 1 } : {}), ...(item.termHits ? { keywordTermHits: item.termHits } : {}) };
      }).sort((a, b) => b.fusionScore - a.fusionScore || a.id.localeCompare(b.id));
      const fused = fusedCandidates.slice(0, boundedResults);
      if (mode === 'reranked') {
        if (!reranker?.score) throw Object.assign(new Error('Reranked retrieval is unavailable because no reranker is configured.'), { code: 'reranker_unavailable' });
        await reranker.prepare?.();
        const rerankStarted = performance.now();
        const scored = [];
        const rerankCandidates = fusedCandidates.slice(0, 20);
        for (const item of rerankCandidates) {
          const result = await reranker.score(question, item.content);
          scored.push({ ...item, rerankScore: result.score, rerankLatencyMs: result.latencyMs });
        }
        const reranked = scored.sort((a, b) => b.rerankScore - a.rerankScore || a.id.localeCompare(b.id)).slice(0, boundedResults).map((item, index) => ({ ...item, rerankRank: index + 1 }));
        return {
          question, target, filters, mode: 'reranked', results: reranked,
          stages: { vector: vectorResults, keyword: keywordResults, fused, reranked },
          reranker: { model: reranker.model, candidateCount: rerankCandidates.length, finalCount: reranked.length, latencyMs: Math.round((performance.now() - rerankStarted) * 100) / 100 },
          latencyMs: Math.round((performance.now() - started) * 100) / 100,
          embeddingLatencyMs: Math.round((queryStarted - embeddingStarted) * 100) / 100,
          queryLatencyMs: Math.round((performance.now() - queryStarted) * 100) / 100,
          embeddingModel: embeddings.model
        };
      }
      return {
        question, target, filters, mode: 'hybrid', results: fused,
        stages: { vector: vectorResults, keyword: keywordResults, fused },
        latencyMs: Math.round((performance.now() - started) * 100) / 100,
        embeddingLatencyMs: Math.round((queryStarted - embeddingStarted) * 100) / 100,
        queryLatencyMs: Math.round((performance.now() - queryStarted) * 100) / 100,
        embeddingModel: embeddings.model
      };
    }
  };
}
