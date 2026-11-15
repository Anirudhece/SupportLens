export const GEMINI_MIN_INTERVAL_MS = 4500;

export function createGeminiPacer({ clock = () => Date.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), minIntervalMs = GEMINI_MIN_INTERVAL_MS } = {}) {
  let lastStart = null;
  let callCount = 0;
  return {
    async beforeCall() {
      const now = clock();
      if (lastStart !== null) {
        const waitMs = Math.max(0, minIntervalMs - (now - lastStart));
        if (waitMs) await sleep(waitMs);
      }
      lastStart = clock();
      callCount += 1;
      return lastStart;
    },
    stats() { return { callCount, lastStart }; }
  };
}
