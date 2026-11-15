import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { chunkDocument, chunkingVersion } from '../chunking/chunkDocument.js';
import { extractDocument } from '../loaders/documentLoaders.js';
import { documentChecksum, persistUpload } from './documentRegistry.js';
import { normalizeMetadataLabels } from '../validation/metadata.js';

export function createIngestionService({ config, embeddings, repository, registry }) {
  if (typeof registry?.withTargetLock !== 'function') {
    throw new Error('Ingestion requires target-scoped operation locking.');
  }
  const chunkStrategy = config.rag.chunkStrategy ?? 'heading-aware';
  const chunkTokens = config.rag.chunkTokens ?? 240;
  const chunkOverlap = config.rag.chunkOverlap ?? 15;
  const withTargetLock = registry.withTargetLock.bind(registry);
  return {
    async ingest({ buffer, originalName, mimeType, target, metadata = {} }) {
      const labels = normalizeMetadataLabels(metadata);
      return withTargetLock(target, async () => {
        const checksum = documentChecksum(buffer);
        const previous = await registry.findByChecksum(checksum, target);
        if (previous) return { ...previous, duplicate: true };
        const priorVersions = (await registry.list(target)).filter((document) => document.name === originalName);
        const version = priorVersions.reduce((highest, document) => Math.max(highest, document.version || 0), 0) + 1;
        const extracted = await extractDocument(buffer, originalName, mimeType);
        if (!extracted.text) throw Object.assign(new Error('The document contains no extractable text.'), { code: 'empty_document' });
        const id = randomUUID();
        const safeName = `${checksum}-${path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = await persistUpload({ buffer, uploadDir: config.storage.uploadDir, filename: safeName });
        await embeddings.prepare?.();
        const sourceSections = extracted.sections || [{ text: extracted.text, page: undefined }];
        const rawChunks = sourceSections.flatMap((section) => chunkDocument(section.text, {
          strategy: chunkStrategy,
          maxTokens: chunkTokens,
          overlapTokens: chunkOverlap,
          tokenizer: embeddings.tokenizer,
          source: id + ':' + (section.page || 'document')
        }).map((chunk) => ({ ...chunk, page: section.page })));
        const vectors = await embeddings.embed(rawChunks.map((chunk) => chunk.content));
        const chunks = rawChunks.map((chunk, index) => ({
          id: `${id}-${index}`,
          content: chunk.content,
          embedding: vectors[index],
          metadata: { documentId: id, source: originalName, section: chunk.section || '', checksum, version, ...labels, ...(chunk.page ? { page: chunk.page } : {}) }
        }));
        await repository.addChunks(target, chunks);
        const document = {
          id,
          target,
          name: originalName,
          checksum,
          version,
          status: 'ready',
          chunkCount: chunks.length,
          chunkingVersion: chunkingVersion({
            strategy: chunkStrategy,
            maxTokens: chunkTokens,
            overlapTokens: chunkOverlap
          }),
          storedPath: filePath,
          createdAt: new Date().toISOString(),
          ...labels
        };
        return registry.add(document);
      });
    }
  };
}
