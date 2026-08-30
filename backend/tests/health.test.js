import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/environment.js';

const config = {
  frontendOrigin: 'http://localhost:3000',
  cloudConfigured: true,
  health: { heartbeatTimeoutMs: 100 },
  cloud: { apiKey: 'test-key', tenant: 'test-tenant', database: 'test-db' },
  local: { host: 'localhost', port: 8000, ssl: false }
};

function fakeClients() {
  return {
    local: { heartbeat: vi.fn().mockResolvedValue(123) },
    cloud: { heartbeat: vi.fn().mockResolvedValue(456) }
  };
}

describe('health endpoints', () => {
  it('returns liveness without contacting ChromaDB', async () => {
    const clients = fakeClients();
    const response = await request(createApp({ config, clients })).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'backend' });
    expect(clients.local.heartbeat).not.toHaveBeenCalled();
    expect(clients.cloud.heartbeat).not.toHaveBeenCalled();
  });

  it.each(['local', 'cloud'])('returns connected for a healthy %s client', async (target) => {
    const clients = fakeClients();
    const response = await request(createApp({ config, clients }))
      .get(`/health/dependencies?target=${target}`)
      .set('Origin', 'http://localhost:3000');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ target, status: 'connected' });
    expect(clients[target].heartbeat).toHaveBeenCalledOnce();
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('rejects an unknown target', async () => {
    const response = await request(createApp({ config, clients: fakeClients() }))
      .get('/health/dependencies?target=other');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_target');
  });

  it('reports missing Cloud configuration without exposing credentials', async () => {
    const unconfigured = { ...config, cloudConfigured: false };
    const response = await request(createApp({ config: unconfigured, clients: fakeClients() }))
      .get('/health/dependencies?target=cloud');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ target: 'cloud', status: 'not-configured' });
    expect(JSON.stringify(response.body)).not.toContain('test-key');
  });

  it('returns 503 when the selected dependency is unreachable', async () => {
    const clients = fakeClients();
    clients.local.heartbeat.mockRejectedValue(new Error('connection refused'));
    const response = await request(createApp({ config, clients }))
      .get('/health/dependencies?target=local');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: 'dependency_unreachable',
      status: 'unreachable',
      message: 'The selected dependency could not be reached.'
    });
    expect(JSON.stringify(response.body)).not.toContain('connection refused');
  });

  it('returns a secret-safe 503 when the heartbeat never resolves', async () => {
    const clients = fakeClients();
    clients.local.heartbeat.mockImplementation(() => new Promise(() => {}));
    const response = await request(createApp({
      config: { ...config, health: { heartbeatTimeoutMs: 10 } },
      clients
    })).get('/health/dependencies?target=local');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: 'dependency_unreachable',
      status: 'unreachable',
      message: 'The selected dependency could not be reached.'
    });
    expect(JSON.stringify(response.body)).not.toContain('timed out');
  });
});

describe('backend configuration', () => {
  it('binds to loopback and uses a bounded heartbeat timeout by default', () => {
    const config = loadConfig({});

    expect(config.host).toBe('127.0.0.1');
    expect(config.health.heartbeatTimeoutMs).toBe(5000);
  });

  it('allows deployment environments to override the bind host and timeout', () => {
    const config = loadConfig({
      BACKEND_HOST: '0.0.0.0',
      HEALTH_HEARTBEAT_TIMEOUT_MS: '2500'
    });

    expect(config.host).toBe('0.0.0.0');
    expect(config.health.heartbeatTimeoutMs).toBe(2500);
  });
});
