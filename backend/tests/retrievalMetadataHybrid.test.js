import { describe, expect, it, vi } from 'vitest';
import { createChromaRepository } from '../src/repositories/chromaRepository.js';
import { createRetrievalService } from '../src/services/retrievalService.js';
import { normalizeMetadataLabels } from '../src/validation/metadata.js';

const config = { rag: { retrievalK: 2 } };

describe('metadata filtering and hybrid retrieval', () => {
  it('rejects unknown or malformed filter keys and normalizes exact labels', () => {
    expect(() => normalizeMetadataLabels({ product: 'billing', nope: 'x' })).toThrow('Unknown metadata field');
    expect(() => normalizeMetadataLabels({ product: 42 })).toThrow('product must be');
    expect(normalizeMetadataLabels({ product: ' billing ' })).toEqual({ product: 'billing' });
  });
  it('forwards server-side metadata where filters to Chroma', async () => {
    const query = vi.fn().mockResolvedValue({ ids: [['a']], documents: [['x']], metadatas: [[{ product: 'billing' }]], distances: [[0.1]] });
    const collection = { query };
    const repository = createChromaRepository({ clients: { local: { getOrCreateCollection: vi.fn().mockResolvedValue(collection) }, cloud: null } });
    await repository.query('local', [0.1], 2, { where: { $and: [{ product: 'billing' }, { documentVersion: 'v2' }] } });
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: { $and: [{ product: 'billing' }, { documentVersion: 'v2' }] } }));
  });

  it('uses whereDocument and preserves target-scoped collection for keyword candidates', async () => {
    const get = vi.fn().mockResolvedValue({ ids: ['a'], documents: ['PAYMENT_4027'], metadatas: [{ product: 'billing' }] });
    const local = { getOrCreateCollection: vi.fn().mockResolvedValue({ get }) };
    const repository = createChromaRepository({ clients: { local, cloud: null } });
    const results = await repository.keyword('local', ['PAYMENT_4027'], 20, { where: { product: 'billing' } });
    expect(results[0].id).toBe('a');
    expect(local.getOrCreateCollection).toHaveBeenCalledWith(expect.objectContaining({ name: 'supportlens_m2_local' }));
    expect(get).toHaveBeenCalledWith({ where: { product: 'billing' }, whereDocument: { $contains: 'PAYMENT_4027' }, limit: 20 });
  });

  it('deduplicates and deterministically fuses vector and keyword stages without losing vector score', async () => {
    const repository = {
      query: vi.fn().mockResolvedValue([
        { id: 'b', content: 'b', metadata: {}, score: 0.8 },
        { id: 'a', content: 'a', metadata: {}, score: 0.7 }
      ]),
      keyword: vi.fn().mockResolvedValue([
        { id: 'a', content: 'a', metadata: {}, termHits: ['CODE'] },
        { id: 'c', content: 'c', metadata: {}, termHits: ['CODE'] }
      ])
    };
    const service = createRetrievalService({ config, repository, embeddings: { model: 'test', embed: vi.fn().mockResolvedValue([[0.1]]) } });
    const result = await service.retrieve({ question: 'What is CODE?', target: 'local', mode: 'hybrid' });
    expect(result.results.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.results[0]).toMatchObject({ id: 'a', score: 0.7, vectorRank: 2, keywordRank: 1 });
    expect(result.stages.keyword).toHaveLength(2);
    expect(repository.query).toHaveBeenCalledWith('local', [0.1], 10);
  });

  it('fails explicitly when hybrid retrieval is unavailable', async () => {
    const repository = { query: vi.fn().mockResolvedValue([{ id: 'a' }]) };
    const service = createRetrievalService({ config, repository, embeddings: { embed: vi.fn().mockResolvedValue([[0.1]]) } });
    await expect(service.retrieve({ question: 'CODE', target: 'local', mode: 'hybrid' })).rejects.toMatchObject({ code: 'hybrid_unavailable' });
  });

  it('prioritizes identifier-like terms and drops common words', async () => {
    const repository = { query: vi.fn().mockResolvedValue([]), keyword: vi.fn().mockResolvedValue([]) };
    const service = createRetrievalService({ config, repository, embeddings: { embed: vi.fn().mockResolvedValue([[0.1]]) } });
    await service.retrieve({ question: 'Please explain what happens when a customer sees PAYMENT_4027 after upgrading the subscription plan', target: 'local', mode: 'hybrid' });
    expect(repository.keyword.mock.calls[0][1][0]).toBe('PAYMENT_4027');
  });

  it('reranks bounded hybrid candidates with injected pair scores and exposes latency/model', async () => {
    const repository = {
      query: vi.fn().mockResolvedValue([{ id: 'a', content: 'a', metadata: {}, score: .2 }]),
      keyword: vi.fn().mockResolvedValue([{ id: 'b', content: 'b', metadata: {}, termHits: ['CODE'] }, { id: 'c', content: 'c', metadata: {}, termHits: ['CODE'] }])
    };
    const reranker = { model: 'mock-reranker', prepare: vi.fn(), score: vi.fn().mockImplementation(async (_q, passage) => ({ score: passage === 'c' ? .95 : passage === 'b' ? .9 : .1, latencyMs: 1 })) };
    const service = createRetrievalService({ config, repository, reranker, embeddings: { embed: vi.fn().mockResolvedValue([[.1]]) } });
    const result = await service.retrieve({ question: 'What is CODE?', target: 'local', mode: 'reranked' });
    expect(result.results[0]).toMatchObject({ id: 'c', rerankScore: .95, rerankRank: 1 });
    expect(result.stages.fused).toHaveLength(2);
    expect(result.reranker).toMatchObject({ model: 'mock-reranker', candidateCount: 3, finalCount: 2 });
  });
});
