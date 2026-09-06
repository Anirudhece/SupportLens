import { describe, expect, it, vi } from 'vitest';
import { COLLECTIONS, M1_COLLECTIONS, createChromaRepository } from '../src/repositories/chromaRepository.js';

describe('Chroma collection versions', () => {
  it('uses M2 collections by default while retaining M1 names', () => {
    expect(COLLECTIONS).toEqual({ local: 'supportlens_m2_local', cloud: 'supportlens_m2_cloud' });
    expect(M1_COLLECTIONS).toEqual({ local: 'supportlens_m1_local', cloud: 'supportlens_m1_cloud' });
  });

  it('counts chunks through the selected collection', async () => {
    const collection = { count: vi.fn().mockResolvedValue(3) };
    const client = { getOrCreateCollection: vi.fn().mockResolvedValue(collection) };
    const repository = createChromaRepository({ clients: { local: client, cloud: null } });
    expect(await repository.count('local')).toBe(3);
    expect(client.getOrCreateCollection).toHaveBeenCalledWith(expect.objectContaining({ name: 'supportlens_m2_local' }));
  });

  it('resolves the active registry pointer for every operation', async () => {
    const collections = new Map();
    const client = {
      getOrCreateCollection: vi.fn(({ name }) => {
        const value = collections.get(name) || { count: vi.fn().mockResolvedValue(1), query: vi.fn().mockResolvedValue({ ids: [[]], documents: [[]], metadatas: [[]], distances: [[]] }) };
        collections.set(name, value);
        return Promise.resolve(value);
      })
    };
    let active = 'supportlens_m2_local';
    const registry = { getActiveCollection: vi.fn(async () => active) };
    const repository = createChromaRepository({ clients: { local: client, cloud: null }, registry });
    await repository.count('local');
    active = 'supportlens_m2_local_reindex_candidate';
    await repository.count('local');
    expect(client.getOrCreateCollection.mock.calls.map(([options]) => options.name)).toEqual([
      'supportlens_m2_local', 'supportlens_m2_local_reindex_candidate'
    ]);
  });

  it('evicts a rejected collection promise so the next attempt can recover', async () => {
    const collection = { count: vi.fn().mockResolvedValue(4) };
    const client = {
      getOrCreateCollection: vi.fn()
        .mockRejectedValueOnce(new Error('temporary Chroma failure'))
        .mockResolvedValueOnce(collection)
    };
    const repository = createChromaRepository({ clients: { local: client, cloud: null } });
    await expect(repository.count('local')).rejects.toThrow('temporary Chroma failure');
    await expect(repository.count('local')).resolves.toBe(4);
    expect(client.getOrCreateCollection).toHaveBeenCalledTimes(2);
  });

  it('splits storage writes at the requested batch size', async () => {
    const add = vi.fn().mockResolvedValue();
    const collection = { add, count: vi.fn().mockResolvedValue(3) };
    const client = { getOrCreateCollection: vi.fn().mockResolvedValue(collection), getMaxBatchSize: vi.fn().mockResolvedValue(3) };
    const repository = createChromaRepository({ clients: { local: client, cloud: null } });
    await repository.addChunks('local', Array.from({ length: 5 }, (_, index) => ({ id: `chunk-${index}`, content: 'x', embedding: [0.1], metadata: {} })), { batchSize: 2 });
    expect(add.mock.calls.map(([records]) => records.ids.length)).toEqual([2, 2, 1]);
    await repository.addChunks('local', Array.from({ length: 5 }, (_, index) => ({ id: `next-${index}`, content: 'x', embedding: [0.1], metadata: {} })), { batchSize: 64 });
    expect(add.mock.calls.slice(3).map(([records]) => records.ids.length)).toEqual([3, 2]);
  });

  it('treats the Chroma SDK absent-collection error as an idempotent delete', async () => {
    const client = {
      deleteCollection: vi.fn().mockRejectedValue({
        name: 'ChromaNotFoundError',
        constructor: 'ChromaNotFoundError',
        message: 'The requested resource could not be found'
      })
    };
    const repository = createChromaRepository({ clients: { local: client, cloud: null } });
    await expect(repository.deleteCollection('local')).resolves.toBeUndefined();
    expect(client.deleteCollection).toHaveBeenCalledWith({ name: 'supportlens_m2_local' });
  });

  it('still propagates non-absence delete failures', async () => {
    const client = { deleteCollection: vi.fn().mockRejectedValue(new Error('permission denied')) };
    const repository = createChromaRepository({ clients: { local: client, cloud: null } });
    await expect(repository.deleteCollection('local')).rejects.toThrow('permission denied');
  });
});
