import cors from 'cors';
import express from 'express';
import { createChromaClients } from './clients/chromaClients.js';
import { loadConfig } from './config/environment.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createHealthRoutes } from './routes/healthRoutes.js';
import { createDocumentRoutes } from './routes/documentRoutes.js';
import { createRagRoutes } from './routes/ragRoutes.js';
import { createLocalEmbeddingProvider } from './embedding/localMiniLm.js';
import { createDocumentRegistry } from './services/documentRegistry.js';
import { createIngestionService } from './services/ingestionService.js';
import { createRetrievalService } from './services/retrievalService.js';
import { createGenerationService } from './services/generationService.js';
import { createChromaRepository } from './repositories/chromaRepository.js';
import { createLocalReranker } from './services/rerankerService.js';

export function createApp({ config = loadConfig(), clients = createChromaClients(config), services = {} } = {}) {
  const resolvedConfig = {
    ...loadConfig(),
    ...config,
    health: { ...loadConfig().health, ...(config.health || {}) },
    storage: { ...loadConfig().storage, ...(config.storage || {}) },
    embedding: { ...loadConfig().embedding, ...(config.embedding || {}) },
    generation: { ...loadConfig().generation, ...(config.generation || {}) },
    rag: { ...loadConfig().rag, ...(config.rag || {}) }
  };
  const app = express();

  app.use(cors({ origin: resolvedConfig.frontendOrigin }));
  app.use(express.json());

  app.get('/health', (request, response) => {
    response.json({ status: 'ok', service: 'backend' });
  });

  app.use('/health/dependencies', createHealthRoutes({ config: resolvedConfig, clients }));
  const registry = services.registry || createDocumentRegistry({ path: resolvedConfig.storage.registryPath });
  const repository = services.repository || createChromaRepository({ clients, registry });
  const embeddings = services.embeddings || createLocalEmbeddingProvider({ model: resolvedConfig.embedding.model });
  const ingestion = services.ingestion || createIngestionService({ config: resolvedConfig, embeddings, repository, registry });
  const reranker = services.reranker || createLocalReranker({ model: resolvedConfig.rag.rerankerModel });
  const retrieval = services.retrieval || createRetrievalService({ config: resolvedConfig, embeddings, repository, reranker });
  const generation = services.generation || createGenerationService({ config: resolvedConfig });
  app.use('/api/v1/documents', createDocumentRoutes({ config: resolvedConfig, ingestion, registry }));
  app.use('/api/v1', createRagRoutes({ retrieval, generation }));
  app.use(errorHandler);

  return app;
}
