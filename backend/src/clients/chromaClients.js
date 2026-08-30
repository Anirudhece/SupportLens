import { ChromaClient, CloudClient } from 'chromadb';
import { loadConfig } from '../config/environment.js';

export function createChromaClients(config = loadConfig()) {
  const local = new ChromaClient({
    host: config.local.host,
    port: config.local.port,
    ssl: config.local.ssl
  });

  const cloud = config.cloudConfigured
    ? new CloudClient({
        apiKey: config.cloud.apiKey,
        tenant: config.cloud.tenant,
        database: config.cloud.database,
        ...(config.cloud.host ? { host: config.cloud.host } : {})
      })
    : null;

  return { local, cloud };
}
