import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
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

const REINDEX_BATCH_SIZE = 64;

function assertBatchSize(batchSize) {
  if (!Number.isInteger(batchSize) || batchSize <= 0) throw new Error('batchSize must be a positive integer.');
}

function candidateCollectionName(target, baseName) {
  return `${baseName[target]}_reindex_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

async function embedInBatches(embeddings, texts, batchSize = REINDEX_BATCH_SIZE) {
  assertBatchSize(batchSize);
  const vectors = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    const input = texts.slice(start, start + batchSize);
    const batch = await embeddings.embed(input);
    if (!Array.isArray(batch) || batch.length !== input.length) {
      throw new Error(`Embedding count did not match batch input: expected ${input.length}, received ${batch?.length ?? 0}.`);
    }
    vectors.push(...batch);
  }
  return vectors;
}

export async function prepareReindexRecords({ documents, config, embeddings, readDocument = readFile, extract = extractDocument, batchSize = REINDEX_BATCH_SIZE }) {
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
  const vectors = await embedInBatches(embeddings, rawChunks.map(({ chunk }) => chunk.content), batchSize);
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

export async function reindexDocuments({ config, target, embeddings, repository, registry, readDocument, extract, batchSize = REINDEX_BATCH_SIZE }) {
  assertBatchSize(batchSize);
  assertTarget(target);
  assertCloudConfigured(config, target);
  const run = async () => {
    const documents = (await registry.list(target)).filter((document) => document.status === 'ready' && document.target === target);
    if (!documents.length) {
      const error = new Error(`No ready ${target} documents are available to rebuild ${COLLECTIONS[target]}.`);
      error.code = 'no_ready_documents';
      throw error;
    }
    const prepared = await prepareReindexRecords({ documents, config, embeddings, readDocument, extract, batchSize });
    const candidate = candidateCollectionName(target, COLLECTIONS);
    let retainCandidate = false;
    let activationResult;

    try {
      // Build and verify an isolated candidate. The live collection remains
      // readable until the registry atomically activates this candidate.
      await repository.addChunks(target, prepared.records, { collectionName: candidate, batchSize });
      const storedCount = await repository.count(target, { collectionName: candidate });
      if (storedCount !== prepared.records.length) {
        throw new Error(`Reindex verification failed: expected ${prepared.records.length} chunks, stored ${storedCount}.`);
      }
      if (prepared.updates.length) {
        if (typeof registry.activateCollectionAndUpdateChunking !== 'function') {
          throw new Error('Registry does not support atomic collection activation and chunking metadata updates.');
        }
        try {
          activationResult = await registry.activateCollectionAndUpdateChunking(target, candidate, prepared.updates, COLLECTIONS[target]);
        } catch (error) {
          // The registry mutation may have been persisted before lock-release
          // cleanup reported an error. Probe the durable pointer before any
          // cleanup decision; an unknown outcome must retain the candidate.
          retainCandidate = true;
          if (typeof registry.getActiveCollection !== 'function') {
            throw new AggregateError([error], `Reindex activation outcome is unconfirmed; retaining candidate ${candidate}.`, { cause: error });
          }
          try {
            const active = await registry.getActiveCollection(target, COLLECTIONS[target]);
            if (active === candidate) {
              throw new AggregateError([error], `Reindex activation committed but reported an error; retaining active candidate ${candidate}.`, { cause: error });
            }
          } catch (probeError) {
            if (probeError instanceof AggregateError) throw probeError;
            throw new AggregateError([error, probeError], `Reindex activation outcome is unconfirmed; retaining candidate ${candidate}.`, { cause: error });
          }
          retainCandidate = false;
          throw error;
        }
      }
    } catch (error) {
      if (retainCandidate) throw error;
      try {
        await repository.deleteCollection(target, { collectionName: candidate });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          `Reindex failed and cleanup failed for ${candidate}; partial candidate data may remain.`,
          { cause: error }
        );
      }
      throw error;
    }

    const evictedCollections = activationResult?.evictedCollections || [];
    const cleanupWarnings = [];
    for (const collectionName of evictedCollections) {
      if (!collectionName || collectionName === candidate) continue;
      try {
        await repository.deleteCollection(target, { collectionName });
      } catch (error) {
        cleanupWarnings.push({
          code: 'rollback_collection_cleanup_failed',
          collection: collectionName,
          message: error.message
        });
      }
    }

    return {
      target,
      documents: documents.length,
      chunks: prepared.records.length,
      strategy: config.rag.chunkStrategy,
      maxTokens: config.rag.chunkTokens,
      overlapTokens: config.rag.chunkOverlap,
      collection: candidate,
      evictedCollections,
      cleanupWarnings
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
  const registry = createDocumentRegistry({ path: config.storage.registryPath });
  const repository = createChromaRepository({ clients, registry });
  const embeddings = createLocalEmbeddingProvider({ model: config.embedding.model });
  console.log(`Rebuilding ${COLLECTIONS[target]} for ${target}; the active collection will remain available until verification passes.`);
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
