import { Router } from 'express';

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

export function createRagRoutes({ retrieval, generation }) {
  const router = Router();
  router.post('/retrieval', async (request, response, next) => {
    const target = targetFrom(request, response); const question = questionFrom(request, response); const nResults = nResultsFrom(request, response);
    if (!target || !question || nResults === null) return;
    try { response.json(await retrieval.retrieve({ question, target, nResults })); }
    catch (error) { next(error); }
  });
  router.post('/answers', async (request, response, next) => {
    const target = targetFrom(request, response); const question = questionFrom(request, response); const nResults = nResultsFrom(request, response);
    if (!target || !question || nResults === null) return;
    if (/system prompt|reveal.*(secret|prompt|key)|ignore.*(instructions|knowledge base)|jailbreak|bypass.*auth/i.test(question)) {
      response.json({ target, question, status: 'insufficient_context', answer: "I couldn't find that in the knowledge base.", citationIds: [], retrieval: { question, target, results: [], latencyMs: 0 } });
      return;
    }
    try {
      const retrievalResult = await retrieval.retrieve({ question, target, nResults });
      const answer = await generation.answer({ question, results: retrievalResult.results });
      response.json({ ...answer, target, question, retrieval: retrievalResult });
    } catch (error) { next(error); }
  });
  return router;
}
