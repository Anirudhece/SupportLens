import { z } from 'zod';

export const answerSchema = z.object({
  status: z.enum(['answered', 'insufficient_context']),
  answer: z.string().max(5000),
  citationIds: z.array(z.string()).max(10)
});

export function validateAnswer(value, allowedCitationIds) {
  const parsed = answerSchema.parse(value);
  const allowed = new Set(allowedCitationIds);
  if (parsed.citationIds.some((id) => !allowed.has(id))) {
    throw Object.assign(new Error('The model returned an unknown citation.'), { code: 'invalid_citations' });
  }
  if (parsed.status === 'answered' && parsed.citationIds.length === 0) {
    throw Object.assign(new Error('Answered responses must cite retrieved context.'), { code: 'invalid_citations' });
  }
  if (parsed.status === 'insufficient_context') return { ...parsed, citationIds: [] };
  return parsed;
}
