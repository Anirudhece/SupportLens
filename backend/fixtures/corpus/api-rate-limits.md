# API rate limits

The public API allows 100 requests per minute per workspace by default. A response with HTTP 429 includes a Retry-After header in seconds. Clients should use exponential backoff and respect that header.
