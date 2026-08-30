function parseBoolean(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

function parsePort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 5000;

export function loadConfig(env = process.env) {
  const cloud = {
    apiKey: env.CHROMA_API_KEY || '',
    tenant: env.CHROMA_TENANT || '',
    database: env.CHROMA_DATABASE || '',
    host: env.CHROMA_CLOUD_HOST || undefined
  };

  return {
    host: env.BACKEND_HOST || '127.0.0.1',
    port: parsePort(env.PORT, 4000),
    frontendOrigin: env.FRONTEND_ORIGIN || 'http://localhost:3000',
    health: {
      heartbeatTimeoutMs: parsePositiveInteger(
        env.HEALTH_HEARTBEAT_TIMEOUT_MS,
        DEFAULT_HEARTBEAT_TIMEOUT_MS
      )
    },
    local: {
      host: env.CHROMA_LOCAL_HOST || 'localhost',
      port: parsePort(env.CHROMA_LOCAL_PORT, 8000),
      ssl: parseBoolean(env.CHROMA_LOCAL_SSL)
    },
    cloud,
    cloudConfigured: Boolean(cloud.apiKey && cloud.tenant && cloud.database)
  };
}
