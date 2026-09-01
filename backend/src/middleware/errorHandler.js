export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error?.code === 'LIMIT_FILE_SIZE') {
    response.status(413).json({ error: 'file_too_large', message: 'The file exceeds the 5 MB upload limit.' });
    return;
  }
  const inferredCode = error?.name === 'ZodError'
    ? 'invalid_model_output'
    : error?.status === 429 || error?.code === 429 || /quota|resource[_ -]?exhausted|rate[_ -]?limit/i.test(String(error?.code || error?.message || ''))
    ? 'quota_exceeded'
    : /safety|blocked/i.test(String(error?.code || error?.message || ''))
      ? 'safety_blocked'
      : error?.code;
  const clientErrors = {
    unsupported_file_type: [415, 'unsupported_file_type'],
    empty_document: [422, 'empty_document'],
    invalid_citations: [502, 'invalid_model_output'],
    invalid_model_output: [502, 'invalid_model_output'],
    generation_not_configured: [503, 'generation_not_configured'],
    generation_timeout: [504, 'generation_timeout'],
    quota_exceeded: [429, 'provider_quota_exceeded'],
    rate_limit_exceeded: [429, 'provider_quota_exceeded'],
    safety_blocked: [502, 'provider_safety_blocked'],
    target_unavailable: [503, 'dependency_unreachable']
  };
  const [status, code] = clientErrors[inferredCode] || [503, 'dependency_unreachable'];
  response.status(status).json({
    error: code,
    status: code === 'dependency_unreachable' ? 'unreachable' : status >= 500 ? 'unavailable' : 'invalid_request',
    message: status === 503 && code === 'dependency_unreachable'
      ? 'The selected dependency could not be reached.'
      : status === 503 ? 'The answer provider is not configured.'
        : code === 'provider_quota_exceeded' ? 'The answer provider quota is unavailable.'
          : code === 'provider_safety_blocked' ? 'The answer provider blocked this request.'
            : code === 'invalid_model_output' ? 'The answer provider returned an unusable response.'
              : status === 415 ? 'Only Markdown, plain text, and PDF documents are supported.'
                : status === 422 ? 'The document contains no extractable text.'
                  : status >= 500 ? 'The request could not be completed.' : 'The request could not be completed.'
  });
}
