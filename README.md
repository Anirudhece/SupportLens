# SupportLens

SupportLens is a production-oriented RAG knowledge assistant being built as an explicit, measurable learning project. Milestone 0 currently provides the JavaScript application foundation and Local/Cloud ChromaDB connectivity diagnostics; ingestion, retrieval, and answer generation are intentionally deferred.

## Milestone 0 status

The local development path is implemented and verified:

```text
Next.js frontend
      ↓ HTTP
Express backend
      ↓ HTTP
Local ChromaDB
```

The Chroma Cloud path is implemented but still requires local account credentials and a successful real heartbeat before Milestone 0 can be marked complete.

## Prerequisites

- NVM
- Node.js `24.20.0`
- npm `11.19.0`, included with the approved Node release
- A Chroma Cloud account only when verifying the Cloud target

Activate the repository runtime and install the pinned dependencies:

```bash
nvm install
nvm use
npm install
```

## Environment configuration

The local defaults work without real environment files. To configure them explicitly:

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

For Chroma Cloud, fill in these values only in `backend/.env`:

```env
CHROMA_API_KEY=
CHROMA_TENANT=
CHROMA_DATABASE=
```

The Express API binds to `127.0.0.1` by default so the local development server is not exposed to the surrounding network. A deployment environment can override this with `BACKEND_HOST`. Dependency heartbeats return an unavailable response after `5000` milliseconds by default; `HEALTH_HEARTBEAT_TIMEOUT_MS` can override that bound.

Use `CHROMA_CLOUD_HOST` when the database uses a non-default Chroma Cloud region. Never put Chroma credentials in a `NEXT_PUBLIC_` variable or commit a real `.env` file.

## Start the application

Start the frontend, backend, and local ChromaDB server together:

```bash
npm run dev
```

The services run at:

- Frontend: `http://localhost:3000`
- Express API: `http://localhost:4000`
- Local ChromaDB: `http://localhost:8000`

The local ChromaDB data persists under `.local/chroma`, which is ignored by Git.

The services can also be started independently:

```bash
npm run dev:frontend
npm run dev:backend
npm run dev:chroma
```

## Health endpoints

```text
GET /health
GET /health/dependencies?target=local
GET /health/dependencies?target=cloud
```

`/health` verifies only Express liveness. The dependency endpoint performs a real heartbeat against the selected backend-owned Chroma client and bounds how long the API waits for that heartbeat.

## Verification commands

Run deterministic backend tests:

```bash
npm test
```

With the local ChromaDB server running:

```bash
npm run test:integration:local
```

With valid Chroma Cloud values in `backend/.env`:

```bash
npm run test:integration:cloud
```

The Cloud command intentionally fails with a clear configuration message when the required credentials are absent. This prevents an unverified Cloud integration from being reported as successful.

Build the frontend for production:

```bash
npm run build
```

See [Milestone 0](docs/Milestones/Milestone_0_Environment_Setup.md) for the approved decisions, pass/fail gate, and current verification evidence.
