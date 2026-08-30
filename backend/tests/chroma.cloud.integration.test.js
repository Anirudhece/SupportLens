import { CloudClient } from 'chromadb';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/environment.js';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const config = loadConfig();
const configured = config.cloudConfigured;

describe.skipIf(!configured)('real Chroma Cloud heartbeat', () => {
  it('confirms the Cloud server through the Express endpoint', async () => {
    const client = new CloudClient({
      apiKey: config.cloud.apiKey,
      tenant: config.cloud.tenant,
      database: config.cloud.database,
      ...(config.cloud.host ? { host: config.cloud.host } : {})
    });
    const response = await request(createApp({
      config,
      clients: { local: null, cloud: client }
    })).get('/health/dependencies?target=cloud');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ target: 'cloud', status: 'connected' });
  });
});

if (!configured) {
  describe('real Chroma Cloud heartbeat configuration', () => {
    it('fails clearly until backend credentials are configured', () => {
      throw new Error(
        'Cloud heartbeat requires CHROMA_API_KEY, CHROMA_TENANT, and CHROMA_DATABASE in backend/.env.'
      );
    });
  });
}
