import { Router } from 'express';
import { normalizeMetadataLabels } from '../validation/metadata.js';

function targetFrom(request, response) {
  const target = request.body?.target || 'local';
  if (target !== 'local' && target !== 'cloud') { response.status(400).json({ error: 'invalid_target', message: 'target must be local or cloud' }); return null; }
  return target;
}

function questionFrom(request, response) {
  const question = typeof request.body?.question === 'string' ? request.body.question.trim() : '';
  if (!question || question.length > 2000) { response.status(400).json({ error: 'invalid_question', message: 'question is required and must be at most 2000 characters.' }); return null; }
  return question;
}

function nResultsFrom(request, response) {
  const value = request.body?.nResults ?? request.body?.topK;
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    response.status(400).json({ error: 'invalid_n_results', message: 'nResults must be an integer from 1 to 10.' });
    return null;
  }
  return value;
}

function filtersFrom(request, response) {
  const body = request.body || {};
  const input = body.filters === undefined
    ? Object.fromEntries(['product', 'documentType', 'documentVersion'].filter((key) => body[key] !== undefined).map((key) => [key, body[key]]))
    : body.filters;
  try { return normalizeMetadataLabels(input); }
  catch (error) { response.status(400).json({ error: error.code, message: error.message }); return null; }
}

function modeFrom(request, response) {
  const mode = request.body?.mode ?? (request.body?.hybrid === true ? 'hybrid' : 'vector');
  if (mode !== 'vector' && mode !== 'hybrid' && mode !== 'reranked') {
    response.status(400).json({ error: 'invalid_retrieval_mode', message: 'mode must be vector, hybrid, or reranked.' });
    return null;
  }
  return mode;
}

export function createRagRoutes({ retrieval, generation }) {
  const router = Router();
  router.post('/retrieval', async (request, response, next) => {
    const target = targetFrom(request, response); if (!target) return;
    const question = questionFrom(request, response); if (!question) return;
    const nResults = nResultsFrom(request, response); if (nResults === null) return;
    const filters = filtersFrom(request, response); if (filters === null) return;
    const mode = modeFrom(request, response); if (mode === null) return;
    try { response.json(await retrieval.retrieve({ question, target, nResults, filters, mode })); }
    catch (error) { next(error); }
  });
  router.post('/answers', async (request, response, next) => {
    const target = targetFrom(request, response); if (!target) return;
    const question = questionFrom(request, response); if (!question) return;
    const nResults = nResultsFrom(request, response); if (nResults === null) return;
    const filters = filtersFrom(request, response); if (filters === null) return;
    const mode = modeFrom(request, response); if (mode === null) return;
    if (/system prompt|reveal.*(secret|prompt|key)|ignore.*(instructions|knowledge base)|jailbreak|bypass.*auth/i.test(question)) {
      response.json({ target, question, filters, status: 'insufficient_context', answer: "I couldn't find that in the knowledge base.", citationIds: [], retrieval: { question, target, filters, results: [], latencyMs: 0 } });
      return;
    }
    try {
      const retrievalResult = await retrieval.retrieve({ question, target, nResults, filters, mode });
      if (!retrievalResult.results.length) {
        response.json({ target, question, filters, status: 'insufficient_context', answer: "I couldn't find that in the knowledge base.", citationIds: [], retrieval: retrievalResult });
        return;
      }
      const answer = await generation.answer({ question, results: retrievalResult.results });
      response.json({ ...answer, target, question, filters, retrieval: retrievalResult });
    } catch (error) { next(error); }
  });
  return router;
}
