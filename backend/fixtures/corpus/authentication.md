# Authentication troubleshooting

ERR_AUTH_1003 is returned when a session token is expired. The client should refresh the session token and retry the request once. If refreshing fails, the user should sign in again.

API keys are shown only once when created. Support must never request or reveal a customer's API key.
