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

  it('preserves approved dependency punctuation and other punctuation-heavy content', () => {
    const text = `# Approved dependencies

- \`@chroma-core/default-embed@0.1.9\`
- \`@huggingface/transformers@3.8.1\`
- \`@google/genai@2.19.0\`
- \`multer@2.3.0\`
- \`pdf-parse@2.4.5\`
- \`zod@4.5.4\`

Use version 0.1.9. Visit https://example.com/v1.2/docs. Keep chunkDocument.test.js in \`@scope/package@1.2.3\`.`;
    const chunks = chunkDocument(text, { maxTokens: 8, overlapTokens: 0, tokenizer, source: 'punctuation' });
    const body = text
      .split(/\n\s*\n/)
      .map((section, index) => {
        const lines = section.split('\n');
        if (index === 0) lines.shift();
        return lines.join(' ').trim();
      })
      .filter(Boolean)
      .join(' ');
    const reconstructed = chunks
      .map((chunk) => {
        const headingPrefix = chunk.section || '';
        return headingPrefix && chunk.content.startsWith(headingPrefix)
          ? chunk.content.slice(headingPrefix.length).trim()
          : chunk.content;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.tokenCount <= 8)).toBe(true);
    expect(reconstructed).toBe(body.replace(/\s+/g, ' '));
    expect(reconstructed).toContain('@chroma-core/default-embed@0.1.9');
    expect(reconstructed).toContain('@huggingface/transformers@3.8.1');
    expect(reconstructed).toContain('@google/genai@2.19.0');
    expect(reconstructed).toContain('https://example.com/v1.2/docs');
    expect(reconstructed).toContain('chunkDocument.test.js');
    expect(reconstructed).toContain('@scope/package@1.2.3');
  });

  it('still splits ordinary sentences at terminal punctuation', () => {
    const chunks = chunkDocument('First sentence. Second sentence! Third sentence?', {
      maxTokens: 2,
      overlapTokens: 0,
      tokenizer,
      source: 'sentences'
    });

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      'First sentence.',
      'Second sentence!',
      'Third sentence?'
    ]);
  });

  it('does not carry recursive overlap across heading boundaries', () => {
    const chunks = chunkDocument('# Billing\n\nalpha beta gamma delta.\n\n# Auth\n\ntoken refresh required.', {
      maxTokens: 5, overlapTokens: 2, tokenizer, source: 'boundary'
    });
    const authChunk = chunks.find((chunk) => chunk.section === 'Auth');
    expect(authChunk.content).toBe('Auth\ntoken refresh required.');
    expect(authChunk.content).not.toContain('gamma');
  });

  it('reindexes chunks after final safety splitting', () => {
    const chunks = chunkDocument('# Errors\n\nshort extraordinarilylongidentifier short', {
      maxTokens: 3, overlapTokens: 0, tokenizer, source: 'reindex'
    });
    expect(chunks.map((chunk) => chunk.id)).toEqual(chunks.map((_, index) => `reindex:${index}`));
    expect(new Set(chunks.map((chunk) => chunk.id)).size).toBe(chunks.length);
  });

  it('supports deterministic heading-aware packing without overlap across headings', () => {
    const text = `# Billing\n\nFirst billing fact.\n\nSecond billing fact.\n\n# Authentication\n\nThe token expires after one hour.`;
    const options = { strategy: 'heading-aware', maxTokens: 5, overlapTokens: 1, tokenizer, source: 'heading' };
    const first = chunkDocument(text, options);
    const second = chunkDocument(text, options);
    expect(first).toEqual(second);
    expect(first.every((chunk) => chunk.tokenCount <= 5)).toBe(true);
    expect(first.filter((chunk) => chunk.section === 'Billing').length).toBeGreaterThan(1);
    const authentication = first.filter((chunk) => chunk.section === 'Authentication');
    const authenticationBody = authentication.map((chunk) => chunk.content.replace('Authentication\n', '')).join(' ');
    expect(authenticationBody).toContain('The');
    expect(authenticationBody).toContain('token');
    expect(authenticationBody).toContain('expires');
    expect(authenticationBody).toContain('one hour.');
    expect(authentication.every((chunk) => !chunk.content.includes('fact.'))).toBe(true);
  });

  it('packs same-heading blocks losslessly when overlap is disabled', () => {
    const text = `# Runtime\n\nOne package is pinned.\n\nAnother package is pinned.\n\n# Storage\n\nVectors are stored separately.`;
    const chunks = chunkDocument(text, { strategy: 'heading-aware', maxTokens: 8, overlapTokens: 0, tokenizer, source: 'lossless' });
    const body = chunks.map((chunk) => chunk.content.replace(`${chunk.section}\n`, '')).join(' ');
    expect(body).toBe('One package is pinned. Another package is pinned. Vectors are stored separately.');
    expect(chunks.every((chunk) => chunk.tokenCount <= 8)).toBe(true);
    expect(chunks.every((chunk) => chunk.section)).toBe(true);
  });

  it('rejects an unknown chunking strategy', () => {
    expect(() => chunkDocument('text', { strategy: 'unknown', tokenizer })).toThrow('Unknown chunking strategy');
  });

  it('keeps heading-aware fragments token-safe when the heading exceeds the limit', () => {
    const chunks = chunkDocument('# A very long heading\n\nalpha beta', {
      strategy: 'heading-aware', maxTokens: 1, overlapTokens: 0, tokenizer, source: 'tiny'
    });
    expect(chunks.every((chunk) => chunk.tokenCount <= 1)).toBe(true);
    expect(chunks.every((chunk) => chunk.section === 'A very long heading')).toBe(true);
  });

  it('reserves capacity when the heading exactly equals the token limit', () => {
    const chunks = chunkDocument('# A\n\nalpha beta', {
      strategy: 'heading-aware', maxTokens: 1, overlapTokens: 0, tokenizer, source: 'equal'
    });
    expect(chunks.every((chunk) => chunk.tokenCount <= 1)).toBe(true);
    expect(chunks.every((chunk) => chunk.section === 'A')).toBe(true);
    expect(chunks.map((chunk) => chunk.content)).toEqual(['alpha', 'beta']);
  });
});
