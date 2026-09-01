import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config/environment.js';
import { createChromaClients } from '../src/clients/chromaClients.js';
import { createChromaRepository } from '../src/repositories/chromaRepository.js';
import { createLocalEmbeddingProvider } from '../src/embedding/localMiniLm.js';
import { createDocumentRegistry } from '../src/services/documentRegistry.js';
import { createIngestionService } from '../src/services/ingestionService.js';

const config = loadConfig();
const target = process.argv[2] || 'local';
if (!['local', 'cloud'].includes(target)) throw new Error('Usage: npm run seed -- [local|cloud]');
const clients = createChromaClients(config);
const ingestion = createIngestionService({ config, embeddings: createLocalEmbeddingProvider({ model: config.embedding.model }), repository: createChromaRepository({ clients }), registry: createDocumentRegistry({ path: config.storage.registryPath }) });
const fixtureDir = new URL('../fixtures/corpus/', import.meta.url);
const names = (await readdir(fixtureDir)).filter((name) => name.endsWith('.md') || name.endsWith('.txt'));
for (const name of names) {
  const buffer = await readFile(new URL(name, fixtureDir));
  const result = await ingestion.ingest({ buffer, originalName: name, mimeType: 'text/markdown', target });
  console.log(`${name}: ${result.duplicate ? 'already seeded' : `${result.chunkCount} chunks`}`);
}
