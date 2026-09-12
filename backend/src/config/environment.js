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

function parseBoundedPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

function parseExplicitBoundedInteger(name, value, fallback, minimum, maximum) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum) return parsed;
  throw new Error(`Invalid ${name}: expected an integer between ${minimum} and ${maximum}.`);
}

function parseChunkOverlap(value, fallback, maxTokens) {
  const overlap = parseExplicitBoundedInteger('CHUNK_OVERLAP_TOKENS', value, fallback, 0, Number.MAX_SAFE_INTEGER);
  if (overlap >= maxTokens) {
    throw new Error(`Invalid CHUNK_OVERLAP_TOKENS: expected a value between 0 and ${maxTokens - 1}.`);
  }
  return overlap;
}

function parseChunkStrategy(value) {
  if (value === undefined || value === '') return 'heading-aware';
  if (value === 'recursive' || value === 'heading-aware') return value;
  throw new Error('Invalid CHUNK_STRATEGY: expected "recursive" or "heading-aware".');
}

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 5000;

export function loadConfig(env = process.env) {
  const chunkTokens = parseExplicitBoundedInteger('CHUNK_MAX_TOKENS', env.CHUNK_MAX_TOKENS, 240, 1, 240);
  const chunkOverlap = parseChunkOverlap(env.CHUNK_OVERLAP_TOKENS, 15, chunkTokens);
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
    cloudConfigured: Boolean(cloud.apiKey && cloud.tenant && cloud.database),
    storage: {
      uploadDir: env.SUPPORTLENS_UPLOAD_DIR || '.local/uploads',
      registryPath: env.SUPPORTLENS_REGISTRY_PATH || '.local/documents.json'
    },
    embedding: {
      model: env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2'
    },
    generation: {
      model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      apiKey: env.GEMINI_API_KEY || '',
      timeoutMs: parsePositiveInteger(env.GEMINI_TIMEOUT_MS, 15000),
      maxOutputTokens: parseBoundedPositiveInteger(env.GENERATION_MAX_OUTPUT_TOKENS, 1024, 4096)
    },
    rag: {
      chunkStrategy: parseChunkStrategy(env.CHUNK_STRATEGY),
      chunkTokens,
      chunkOverlap,
      retrievalK: parsePositiveInteger(env.RETRIEVAL_K, 4),
      maxUploadBytes: parsePositiveInteger(env.MAX_UPLOAD_BYTES, 5 * 1024 * 1024)
    }
  };
}
