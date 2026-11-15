import { z } from 'zod';

export const answerSchema = z.object({
  status: z.enum(['answered', 'insufficient_context']),
  answer: z.string().max(5000).optional(),
  citationIds: z.array(z.string()).max(10).optional(),
  claims: z.array(z.object({ text: z.string().max(2000), citationIds: z.array(z.string()).max(10) })).max(20).optional()
});

export function validateAnswer(value, allowedCitationIds) {
  const parsed = answerSchema.parse(value);
  const allowed = new Set(allowedCitationIds);
  const claims = parsed.claims;
  if (parsed.status === 'answered' && claims && (!claims.length || claims.some((claim) => !claim.text.trim() || !claim.citationIds.length))) {
    throw Object.assign(new Error('Answered claims must be nonempty.'), { code: 'invalid_claims' });
  }
  if (claims?.some((claim) => claim.citationIds.some((id) => !allowed.has(id)))) {
    throw Object.assign(new Error('The model returned an unknown citation.'), { code: 'invalid_citations' });
  }
  const claimCitationIds = claims ? [...new Set(claims.flatMap((claim) => claim.citationIds))] : [];
  const citationIds = claims ? claimCitationIds : (parsed.citationIds || []);
  if (citationIds.some((id) => !allowed.has(id))) {
    throw Object.assign(new Error('The model returned an unknown citation.'), { code: 'invalid_citations' });
  }
  if (parsed.status === 'answered' && (!claims || !claims.length || !citationIds.length)) {
    throw Object.assign(new Error('Answered responses must cite retrieved context.'), { code: 'invalid_citations' });
  }
  if (parsed.status === 'insufficient_context') return { status: parsed.status, answer: "I couldn't find that in the knowledge base.", citationIds: [], claims: [] };
  return { ...parsed, answer: claims.map((claim) => claim.text.trim()).join(' '), citationIds, claims };
}
