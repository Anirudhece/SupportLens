import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';

const fixture = JSON.parse(await readFile(new URL('../evals/golden-cases.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('../evals/corpus-manifest.json', import.meta.url), 'utf8'));

describe('M4 golden fixture integrity', () => {
  it('contains 45 unique explicitly-statused cases with valid sources and structured facts', async () => {
    const corpus = new Set((await readdir(new URL('../fixtures/corpus/', import.meta.url))).filter((name) => name.endsWith('.md')));
    expect(fixture.cases).toHaveLength(45);
    expect(new Set(fixture.cases.map((item) => item.id)).size).toBe(45);
    for (const testCase of fixture.cases) {
      expect(['answered', 'insufficient_context']).toContain(testCase.expectedStatus);
      for (const source of (testCase.expectedSources || [])) expect(corpus.has(source)).toBe(true);
      for (const fact of (testCase.requiredFacts || [])) { expect(fact).toMatchObject({ alternatives: expect.any(Array), sources: expect.any(Array) }); for (const source of fact.sources) expect(corpus.has(source)).toBe(true); }
    }
    expect(Object.keys(manifest.documents).sort()).toEqual([...corpus].sort());
    for (const metadata of Object.values(manifest.documents)) expect(metadata).toMatchObject({ product: expect.any(String), documentType: expect.any(String), documentVersion: expect.any(String) });
  });
});
