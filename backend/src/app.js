import cors from 'cors';
import express from 'express';
import { createChromaClients } from './clients/chromaClients.js';
import { loadConfig } from './config/environment.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createHealthRoutes } from './routes/healthRoutes.js';

export function createApp({ config = loadConfig(), clients = createChromaClients(config) } = {}) {
  const app = express();

  app.use(cors({ origin: config.frontendOrigin }));
  app.use(express.json());

  app.get('/health', (request, response) => {
    response.json({ status: 'ok', service: 'backend' });
  });

  app.use('/health/dependencies', createHealthRoutes({ config, clients }));
  app.use(errorHandler);

  return app;
}
