import { Router } from 'express';

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 5000;

class RequestAbortedError extends Error {
  constructor() {
    super('The health-check request was aborted.');
    this.name = 'RequestAbortedError';
  }
}

class HeartbeatTimeoutError extends Error {
  constructor() {
    super('The ChromaDB heartbeat timed out.');
    this.name = 'HeartbeatTimeoutError';
  }
}

function heartbeatWithTimeout(client, request, timeoutMs) {
  const heartbeatTimeoutMs = Number.isInteger(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_HEARTBEAT_TIMEOUT_MS;
  let timer;

  let rejectRequestAbort;
  const requestAborted = new Promise((resolve, reject) => {
    rejectRequestAbort = reject;
  });
  const abortRequest = () => {
    rejectRequestAbort(new RequestAbortedError());
  };
  request.once('aborted', abortRequest);

  // chromadb 3.5.0 does not honor an AbortSignal for heartbeat(). The timer
  // bounds this endpoint's response, while the SDK operation may finish later.
  const heartbeat = Promise.resolve().then(() => client.heartbeat());
  // Promise.race observes the rejection in normal operation, but keep an
  // explicit rejection handler so a late SDK rejection remains handled after
  // the timeout or request-abort branch has already won the race.
  heartbeat.catch(() => {});
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new HeartbeatTimeoutError());
    }, heartbeatTimeoutMs);
  });

  return Promise.race([heartbeat, timeout, requestAborted]).finally(() => {
    clearTimeout(timer);
    request.off('aborted', abortRequest);
  });
}

export function createHealthRoutes({ config, clients }) {
  const router = Router();

  router.get('/', async (request, response, next) => {
    const { target } = request.query;

    if (target !== 'local' && target !== 'cloud') {
      response.status(400).json({
        error: 'invalid_target',
        message: 'target must be local or cloud'
      });
      return;
    }

    if (target === 'cloud' && !config.cloudConfigured) {
      response.status(503).json({
        target,
        status: 'not-configured',
        message: 'Chroma Cloud credentials are not configured.'
      });
      return;
    }

    const client = clients[target];
    if (!client) {
      response.status(503).json({
        target,
        status: 'unreachable',
        message: 'The selected ChromaDB client is unavailable.'
      });
      return;
    }

    try {
      await heartbeatWithTimeout(
        client,
        request,
        config.health?.heartbeatTimeoutMs
      );
      response.json({
        target,
        status: 'connected',
        message: 'ChromaDB heartbeat succeeded.'
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
