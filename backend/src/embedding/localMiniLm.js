import { DefaultEmbeddingFunction } from '@chroma-core/default-embed';

const embeddingPromises = new Map();
const tokenizerPromises = new Map();

export function createLocalEmbeddingProvider({ model = 'Xenova/all-MiniLM-L6-v2' } = {}) {
  return {
    model,
    async embed(texts) {
      if (!embeddingPromises.has(model)) embeddingPromises.set(model, new DefaultEmbeddingFunction({ modelName: model }));
      return (await embeddingPromises.get(model)).generate(texts);
    },
    async prepare() {
      const { AutoTokenizer } = await import('@huggingface/transformers');
      if (!tokenizerPromises.has(model)) tokenizerPromises.set(model, AutoTokenizer.from_pretrained(model));
      this.tokenizer = await tokenizerPromises.get(model);
      return this;
    },
    tokenizer: null
  };
}
