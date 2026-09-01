import { describe, expect, it } from 'vitest';
import { chunkDocument, tokenCount } from '../src/chunking/chunkDocument.js';

const tokenizer = { encode: (text) => ({ ids: text.split(/\s+/).filter(Boolean) }) };

describe('token-aware chunking', () => {
  it('keeps every chunk within the configured maximum and records headings', () => {
    const text = `# Billing\n\n${Array.from({ length: 260 }, (_, index) => `word${index}`).join(' ')}`;
    const chunks = chunkDocument(text, { maxTokens: 20, overlapTokens: 4, tokenizer, source: 'test' });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => tokenCount(chunk.content, tokenizer) <= 20)).toBe(true);
    expect(chunks[0].section).toBe('Billing');
  });

  it('counts tensor-shaped BigInt WordPiece ids and keeps multi-piece chunks bounded', () => {
    const wordPieceTokenizer = {
      encode: (text) => ({ input_ids: { tolist: () => [text.split(/\s+/).filter(Boolean).flatMap((word) => word.length > 8 ? [1n, 2n, 3n] : [1n])] } })
    };
    const chunks = chunkDocument('# Errors\n\nshort extraordinarilylongidentifier short', { maxTokens: 6, overlapTokens: 1, tokenizer: wordPieceTokenizer, source: 'tensor' });
    expect(tokenCount('extraordinarilylongidentifier', wordPieceTokenizer)).toBe(3);
    expect(chunks.every((chunk) => chunk.tokenCount <= 6)).toBe(true);
  });
});
