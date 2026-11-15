import { describe, expect, it } from 'vitest';
import { createLocalReranker, extractLogit } from '../src/services/rerankerService.js';

describe('raw reranker logits', () => {
  it('extracts the final raw logit without probability rounding', () => {
    expect(extractLogit({ logits: { data: Float32Array.from([-1.25]) } })).toBeCloseTo(-1.25);
    expect(extractLogit({ logits: { data: Float32Array.from([-3, 4.75]) } })).toBeCloseTo(4.75);
  });
  it('rejects missing or nonnumeric tensor output', () => {
    expect(() => extractLogit({})).toThrow('numeric logit');
    expect(() => extractLogit({ logits: { data: [Number.NaN] } })).toThrow('numeric logit');
  });
  it('scores injected tokenizer/model pairs and preserves raw values', async () => {
    const reranker = createLocalReranker({ classifier: {
      tokenizer: async () => ({ input_ids: [1] }),
      model: async () => ({ logits: { data: Float32Array.from([2.375]) } })
    }});
    await reranker.prepare();
    const result = await reranker.score('question', 'passage');
    expect(result.score).toBeCloseTo(2.375);
  });
});
