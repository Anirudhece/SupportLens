const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

async function request(path, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${apiBaseUrl}${path}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const payload = await response.json();

    if (!response.ok) {
      return { state: payload.status || 'unreachable', detail: payload.message || payload.error };
    }

    return {
      state: payload.status === 'ok' ? 'connected' : payload.status,
      detail: payload.message || 'The service responded successfully.'
    };
  } catch {
    return { state: 'unreachable', detail: 'The Express API could not be reached.' };
  }
}

export function fetchHealth(fetchImpl) {
  return request('/health', fetchImpl);
}

export function fetchDependencyHealth(target, fetchImpl) {
  const selectedTarget = target === 'cloud' ? 'cloud' : 'local';
  return request(`/health/dependencies?target=${selectedTarget}`, fetchImpl);
}
