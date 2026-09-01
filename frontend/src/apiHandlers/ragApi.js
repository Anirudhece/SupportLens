const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || 'Request failed');
  return body;
}

export function listDocuments(target = 'local') { return request(`/api/v1/documents?target=${target}`); }
export function uploadDocument(file, target = 'local') {
  const form = new FormData(); form.append('file', file); form.append('target', target);
  return request('/api/v1/documents', { method: 'POST', body: form });
}
export function retrieve(question, target = 'local') { return request('/api/v1/retrieval', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, target }) }); }
export function answerQuestion(question, target = 'local') { return request('/api/v1/answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, target }) }); }
