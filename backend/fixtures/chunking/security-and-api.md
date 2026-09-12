# Authentication and API limits

The authentication service rejects a request with `ERR_AUTH_1003` when the access token has expired. The client should obtain a fresh token and retry the original request once. Repeating the request with the same expired token does not repair the condition and may increase the rate-limit counter.

The API gateway allows 120 requests per minute for a standard workspace. The limit is counted per workspace and endpoint family. A response with status 429 includes a `Retry-After` header containing the number of seconds the client should wait before trying again.

## Similar authentication messages

`ERR_AUTH_1004` means the token signature could not be verified. It is different from `ERR_AUTH_1003`: refreshing a token is appropriate for an expired token, while a signature error requires checking the issuer, key rotation, and token transport.

## Similar rate-limit messages

A 503 response from the gateway indicates temporary service unavailability, not a rate-limit decision. The client may use bounded exponential backoff for a 503, but should follow `Retry-After` for a 429. Combining the two policies can cause an unnecessarily long delay.

## Boundary procedure

For an authentication incident, capture the request ID, workspace ID, token issuer, and UTC timestamp. Do not capture the access token itself. The request ID is safe to share with SupportLens and is the preferred identifier for tracing the incident.

## Operational ownership

Identity Engineering owns token validation and key rotation. Traffic Engineering owns workspace quotas and gateway response headers. The on-call runbook links both teams because a single customer report can include an authentication error followed by a rate-limit response.

## Incident response narrative

The first responder starts with the request ID and workspace ID, then checks the UTC timestamp against gateway and identity-service logs. The request ID is a tracing handle, not a credential, and it can be included in an internal support ticket. The responder records the endpoint family, response status, token issuer, and whether the client retried. The access token itself must not be copied into the ticket, terminal output, issue tracker, or retrieval corpus. Redacting only the middle of a token is insufficient because the remaining prefix and suffix can still be sensitive.

The order of events is important when an expired token is followed by a quota response. A client should obtain a fresh token and retry the original request once for `ERR_AUTH_1003`. If the retry produces 429, the rate-limit policy applies and the client follows `Retry-After`; it should not interpret the second response as proof that token refresh failed. If the first response is `ERR_AUTH_1004`, identity engineers inspect signature verification, issuer configuration, and key rotation instead of asking the customer to repeat the same expired-token flow.

For a complete incident handoff, include the request ID, workspace ID, UTC timestamp, endpoint family, response sequence, and the team that owns the next investigation. Identity Engineering owns token validation and key rotation. Traffic Engineering owns workspace quotas and gateway response headers. Support should preserve the distinction between a 429 policy response and a 503 availability response because their retry instructions are different and combining them can delay recovery.

The response sequence is documented as a small incident narrative rather than as a collection of isolated error codes. The responder begins with the request ID, workspace ID, endpoint family, UTC timestamp, token issuer, response status, and retry history, then compares those observations with the identity and gateway logs. An expired access token produces `ERR_AUTH_1003`; the client obtains a fresh token and retries the original request once. A signature-verification failure produces `ERR_AUTH_1004`; the client path is not repaired by repeating the expired-token flow, so Identity Engineering checks the issuer, key rotation, and token transport. If the retry reaches the quota policy, the workspace and endpoint family determine whether the standard 120 requests per minute limit was exceeded, and a 429 response supplies `Retry-After` seconds for the next attempt. A 503 means temporary gateway unavailability and follows bounded availability backoff instead. The responder keeps these events in order because a later 429 does not rewrite the meaning of the earlier authentication response. The handoff includes the request ID, workspace ID, endpoint family, response sequence, token issuer, UTC timestamp, and owning team. It explicitly excludes the access token from the ticket, terminal output, issue tracker, and retrieval corpus; partial redaction is not sufficient. The final owner is Identity Engineering for token validation or key rotation and Traffic Engineering for workspace quotas or gateway response headers. This separation gives Support enough context to reproduce the routing decision without copying a secret and prevents a generic retry recommendation from obscuring the actual failure. The same narrative should remain understandable when retrieved in pieces, so each action is stated with the condition that caused it and the evidence needed for the next team.
