const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || 'Request failed');
  return body;
}

export function listDocuments(target = 'local') { return request(`/api/v1/documents?target=${target}`); }
export function uploadDocument(file, target = 'local', metadata = {}) {
  const form = new FormData(); form.append('file', file); form.append('target', target);
  for (const [key, value] of Object.entries(metadata)) if (value?.trim()) form.append(key, value.trim());
  return request('/api/v1/documents', { method: 'POST', body: form });
}

function normalizeFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters || {})
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

export function retrieve(question, target = 'local', filters = {}, mode = 'vector') { return request('/api/v1/retrieval', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, target, filters: normalizeFilters(filters), mode }) }); }
export function answerQuestion(question, target = 'local', filters = {}) { return request('/api/v1/answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, target, filters: normalizeFilters(filters) }) }); }
