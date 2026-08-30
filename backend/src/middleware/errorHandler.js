export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  response.status(503).json({
    error: 'dependency_unreachable',
    status: 'unreachable',
    message: 'The selected dependency could not be reached.'
  });
}
