# Webhook delivery

Webhook deliveries are retried up to five times when the endpoint returns a 5xx response. Endpoints should acknowledge quickly and process events asynchronously. Event IDs make handlers idempotent.
