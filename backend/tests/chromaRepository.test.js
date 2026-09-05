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
