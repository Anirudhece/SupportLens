import { describe, expect, it } from 'vitest';
import { createGeminiPacer } from '../src/evals/livePacing.js';

describe('M4 Gemini pacing', () => {
  it('spaces provider starts by at least 4500ms with injected clock/sleep', async () => {
    let now = 0; const sleeps = [];
    const pacer = createGeminiPacer({ clock: () => now, sleep: async (ms) => { sleeps.push(ms); now += ms; } });
    await pacer.beforeCall(); now += 1000; await pacer.beforeCall();
    expect(sleeps).toEqual([3500]);
    expect(pacer.stats().callCount).toBe(2);
  });
});
