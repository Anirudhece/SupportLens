import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/environment.js';

describe('chunking configuration validation', () => {
  it('keeps the approved defaults when chunk settings are omitted', () => {
    expect(loadConfig({}).rag).toMatchObject({
      chunkStrategy: 'heading-aware',
      chunkTokens: 240,
      chunkOverlap: 15
    });
  });

  it.each(['0', '-1', '241', '2.5', 'not-a-number'])('rejects unsafe CHUNK_MAX_TOKENS=%s', (value) => {
    expect(() => loadConfig({ CHUNK_MAX_TOKENS: value })).toThrow('Invalid CHUNK_MAX_TOKENS');
  });

  it.each(['-1', '240', '241', '2.5', 'not-a-number'])('rejects invalid CHUNK_OVERLAP_TOKENS=%s', (value) => {
    expect(() => loadConfig({ CHUNK_OVERLAP_TOKENS: value })).toThrow('Invalid CHUNK_OVERLAP_TOKENS');
  });

  it('requires overlap to remain below an explicitly smaller maximum', () => {
    expect(() => loadConfig({ CHUNK_MAX_TOKENS: '10', CHUNK_OVERLAP_TOKENS: '10' }))
      .toThrow('Invalid CHUNK_OVERLAP_TOKENS');
  });
});
