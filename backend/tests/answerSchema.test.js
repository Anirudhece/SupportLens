import { describe, expect, it } from 'vitest';
import { validateAnswer } from '../src/validation/answerSchema.js';

describe('answer validation', () => {
  it('rejects citations that were not retrieved', () => {
    expect(() => validateAnswer({ status: 'answered', answer: 'x', citationIds: ['fake'] }, ['real'])).toThrow();
  });
  it('requires citations for an answered response', () => {
    expect(() => validateAnswer({ status: 'answered', answer: 'x', citationIds: [] }, ['real'])).toThrow();
  });
});
