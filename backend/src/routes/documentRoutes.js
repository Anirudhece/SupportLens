import { Router } from 'express';
import multer from 'multer';
import { normalizeMetadataLabels } from '../validation/metadata.js';

function targetFrom(request, response) {
  const target = request.query.target || request.body?.target || 'local';
  if (target !== 'local' && target !== 'cloud') {
    response.status(400).json({ error: 'invalid_target', message: 'target must be local or cloud' });
    return null;
  }
  return target;
}

function publicDocument(document) {
  const { storedPath, ...safeDocument } = document;
  return safeDocument;
}

export function createDocumentRoutes({ config, ingestion, registry }) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.rag.maxUploadBytes } });
  router.post('/', upload.single('file'), async (request, response, next) => {
    const target = targetFrom(request, response);
    if (!target) return;
    if (!request.file) { response.status(400).json({ error: 'file_required', message: 'Upload a file using the file field.' }); return; }
    try {
      let metadata;
      const metadataInput = Object.fromEntries(['product', 'documentType', 'documentVersion']
        .filter((field) => request.body?.[field] !== undefined)
        .map((field) => [field, request.body[field]]));
      try { metadata = normalizeMetadataLabels(metadataInput); } catch (error) { response.status(400).json({ error: error.code, message: error.message }); return; }
      const result = await ingestion.ingest({ buffer: request.file.buffer, originalName: request.file.originalname, mimeType: request.file.mimetype, target, metadata });
      response.status(result.duplicate ? 200 : 201).json(publicDocument(result));
    } catch (error) { next(error); }
  });
  router.get('/', async (request, response, next) => {
    const target = targetFrom(request, response);
    if (!target) return;
    try { response.json({ target, documents: (await registry.list(target)).map(publicDocument) }); }
    catch (error) { next(error); }
  });
  return router;
}
