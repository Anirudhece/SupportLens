const DEFAULT_MODEL = 'Xenova/ms-marco-MiniLM-L-6-v2';
const MAX_TEXT_LENGTH = 2000;

export function createLocalReranker({ model = DEFAULT_MODEL, classifier } = {}) {
  let runtimePromise;
  async function load() {
    if (classifier) return classifier;
    if (!runtimePromise) runtimePromise = import('@huggingface/transformers').then(async ({ AutoTokenizer, AutoModelForSequenceClassification }) => ({
      tokenizer: await AutoTokenizer.from_pretrained(model),
      model: await AutoModelForSequenceClassification.from_pretrained(model)
    }));
    try { return await runtimePromise; } catch (error) { runtimePromise = undefined; throw Object.assign(new Error(`Reranker model failed to load: ${error.message}`), { code: 'reranker_load_failed', cause: error }); }
  }
  return {
    model,
    async prepare() { await load(); return this; },
    async score(question, passage) {
      const text = String(question).slice(0, MAX_TEXT_LENGTH);
      const pair = String(passage).slice(0, MAX_TEXT_LENGTH);
      const started = performance.now();
      let output;
      try {
        const runtime = await load();
        if (typeof runtime.score === 'function') return await runtime.score(text, pair);
        const inputs = await runtime.tokenizer(text, { text_pair: pair, padding: true, truncation: true, max_length: 512, return_tensors: 'pt' });
        output = await runtime.model(inputs);
      }
      catch (error) { throw Object.assign(new Error(`Reranker inference failed: ${error.message}`), { code: 'reranker_inference_failed', cause: error }); }
      const score = extractLogit(output);
      return { score, latencyMs: performance.now() - started };
    }
  };
}

export { DEFAULT_MODEL, MAX_TEXT_LENGTH };
export function extractLogit(output) {
  const data = output?.logits?.data;
  const score = data?.length ? Number(data[data.length - 1]) : Number.NaN;
  if (!Number.isFinite(score)) throw Object.assign(new Error('Reranker returned no numeric logit.'), { code: 'reranker_invalid_output' });
  return score;
}
