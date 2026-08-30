import { ChromaClient } from 'chromadb';
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
const client = new ChromaClient({
  host: config.local.host,
  port: config.local.port,
  ssl: config.local.ssl
});

describe('real local ChromaDB heartbeat', () => {
  it('confirms the local server through the Express endpoint', async () => {
    const response = await request(createApp({
      config,
      clients: { local: client, cloud: null }
    })).get('/health/dependencies?target=local');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ target: 'local', status: 'connected' });
  });
});
