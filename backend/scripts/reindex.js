import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/environment.js';
import { createChromaClients } from '../src/clients/chromaClients.js';
import { chunkDocument, chunkingVersion } from '../src/chunking/chunkDocument.js';
import { createLocalEmbeddingProvider } from '../src/embedding/localMiniLm.js';
import { extractDocument } from '../src/loaders/documentLoaders.js';
import { createChromaRepository, COLLECTIONS } from '../src/repositories/chromaRepository.js';
import { createDocumentRegistry } from '../src/services/documentRegistry.js';

function assertTarget(target) {
  if (target !== 'local' && target !== 'cloud') {
    const error = new Error('Usage: npm run reindex -- [local|cloud]');
    error.code = 'invalid_target';
    throw error;
  }
}

function assertCloudConfigured(config, target) {
  if (target !== 'cloud' || config.cloudConfigured) return;
  const error = new Error('Cloud reindex requires CHROMA_API_KEY, CHROMA_TENANT, and CHROMA_DATABASE.');
  error.code = 'cloud_not_configured';
  throw error;
}

function sourceSections(extracted) {
  return extracted.sections?.length
    ? extracted.sections
    : [{ text: extracted.text, page: undefined }];
}

export async function prepareReindexRecords({ documents, config, embeddings, readDocument = readFile, extract = extractDocument }) {
  // The production MiniLM provider exposes its tokenizer only after prepare().
  // Chunking must use that tokenizer so the configured bound is measured in
  // the same WordPiece tokens used for embeddings.
  await embeddings.prepare?.();
  const preparedDocuments = [];
  for (const document of documents) {
    if (!document.storedPath) {
      throw new Error(`Ready document ${document.id} has no storedPath.`);
    }
    const buffer = await readDocument(document.storedPath);
    const extracted = await extract(buffer, document.name, '');
    if (!extracted.text) throw new Error(`Ready document ${document.id} contains no extractable text.`);
    const chunks = sourceSections(extracted).flatMap((section) => chunkDocument(section.text, {
      strategy: config.rag.chunkStrategy,
      maxTokens: config.rag.chunkTokens,
      overlapTokens: config.rag.chunkOverlap,
      tokenizer: embeddings.tokenizer,
      source: `${document.id}:${section.page ?? 'document'}`
    }).map((chunk) => ({ ...chunk, page: section.page })));
    preparedDocuments.push({ document, chunks });
  }

  const rawChunks = preparedDocuments.flatMap(({ document, chunks }) => chunks.map((chunk) => ({ document, chunk })));
  const vectors = await embeddings.embed(rawChunks.map(({ chunk }) => chunk.content));
  if (vectors.length !== rawChunks.length) throw new Error('Embedding count did not match prepared chunk count.');

  const records = rawChunks.map(({ document, chunk }, index) => ({
    id: `${document.id}-${index}`,
    content: chunk.content,
    embedding: vectors[index],
    metadata: {
      documentId: document.id,
      source: document.name,
      section: chunk.section || '',
      checksum: document.checksum,
      version: document.version,
      ...(chunk.page !== undefined ? { page: chunk.page } : {})
    }
  }));
  const chunkVersion = chunkingVersion({
    strategy: config.rag.chunkStrategy,
    maxTokens: config.rag.chunkTokens,
    overlapTokens: config.rag.chunkOverlap
  });
  const updates = preparedDocuments.map(({ document, chunks }) => ({
    id: document.id,
    chunkCount: chunks.length,
    chunkingVersion: chunkVersion
  }));
  return { records, updates };
}

export async function reindexDocuments({ config, target, embeddings, repository, registry, readDocument, extract }) {
  assertTarget(target);
  assertCloudConfigured(config, target);
  const run = async () => {
    const documents = (await registry.list(target)).filter((document) => document.status === 'ready' && document.target === target);
    if (!documents.length) {
      const error = new Error(`No ready ${target} documents are available to rebuild ${COLLECTIONS[target]}.`);
      error.code = 'no_ready_documents';
      throw error;
    }
    const prepared = await prepareReindexRecords({ documents, config, embeddings, readDocument, extract });

    try {
      // This is an explicit rebuild of the selected derived M2 collection. All
      // document extraction, chunking, and embedding has completed before the
      // existing target is removed.
      await repository.deleteCollection(target);
      await repository.addChunks(target, prepared.records);
      const storedCount = await repository.count(target);
      if (storedCount !== prepared.records.length) {
        throw new Error(`Reindex verification failed: expected ${prepared.records.length} chunks, stored ${storedCount}.`);
      }
      if (prepared.updates.length) {
        if (typeof registry.updateChunking !== 'function') {
          throw new Error('Registry does not support atomic chunking metadata updates.');
        }
        await registry.updateChunking(prepared.updates);
      }
    } catch (error) {
      try {
        await repository.deleteCollection(target);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Reindex failed and cleanup failed for ${COLLECTIONS[target]}; partial M2 data may remain.`,
          { cause: error }
        );
      }
      throw error;
    }

    return {
      target,
      documents: documents.length,
      chunks: prepared.records.length,
      strategy: config.rag.chunkStrategy,
      maxTokens: config.rag.chunkTokens,
      overlapTokens: config.rag.chunkOverlap,
      collection: COLLECTIONS[target]
    };
  };
  if (typeof registry.withTargetLock !== 'function') {
    throw new Error('Registry does not support target-scoped operation locking.');
  }
  return registry.withTargetLock(target, run);
}

async function main() {
  const target = process.argv[2];
  const config = loadConfig();
  assertTarget(target);
  assertCloudConfigured(config, target);
  const clients = createChromaClients(config);
  const repository = createChromaRepository({ clients });
  const registry = createDocumentRegistry({ path: config.storage.registryPath });
  const embeddings = createLocalEmbeddingProvider({ model: config.embedding.model });
  console.log(`Rebuilding ${COLLECTIONS[target]} for ${target}; existing M2 data will be replaced after preparation.`);
  const result = await reindexDocuments({ config, target, embeddings, repository, registry });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
