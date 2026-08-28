# Milestone 0 — Environment Setup

## Status

**Planned**

Implementation must not begin until the unresolved questions in this document have been discussed, the decisions have been recorded, and the complete scope has received explicit user approval.

## Goal

Establish the SupportLens application foundation and prove a minimal local path across:

```text
Next.js frontend
      ↓ HTTP
Express backend
      ↓ HTTP
Local ChromaDB server
```

This milestone prepares the repository for the first RAG implementation without introducing document ingestion, embeddings, retrieval, or answer generation prematurely.

## Why this milestone is necessary

The repository currently contains product and architecture documentation but no application scaffold, dependency manifest, or verified local development workflow.

Separating environment and service-connectivity work from RAG logic makes later failures easier to diagnose. It ensures that frontend, API, configuration, process startup, and ChromaDB connectivity are known to work before chunking, embeddings, retrieval, and model calls are introduced.

## Confirmed foundation decisions

- Application code uses JavaScript rather than TypeScript.
- Node.js 24 LTS is the supported runtime.
- npm workspaces manage the repository applications.
- The frontend uses Next.js with the App Router.
- The backend uses Express 5 as a separate HTTP API.
- ChromaDB is the primary vector database.
- The initial ChromaDB server runs locally in client-server mode and uses a persistent local data directory.
- The initial implementation does not use LangChain or LlamaIndex.

## Questions that must be discussed before implementation

The following details are deliberately unanswered and must not be selected silently by an implementation agent:

1. Exact npm workspace and source-directory layout.
2. Development ports and environment-variable names for the web app, API, and ChromaDB.
3. Whether all services use separate terminal commands or a development-process orchestration dependency.
4. Testing approach for the Express application and ChromaDB connectivity.
5. Linting and formatting tools and whether a formatter dependency is needed in Milestone 0.
6. Environment validation strategy and whether it requires an additional dependency.
7. Exact local ChromaDB persistence path and which runtime files must be ignored by Git.
8. Whether the frontend status page calls Express from the browser or through a Next.js server-side boundary.
9. Whether ChromaDB connectivity is represented in the primary health endpoint or a separate dependency-health endpoint.
10. Exact dependency list and version policy before installation.

For each question, the agent must explain the practical options and trade-offs, record the user's decision in this document, and update the implementation scope before requesting approval.

## Proposed implementation scope

The following scope is provisional until the questions above are resolved.

### Repository foundation

- Create the root npm workspace configuration.
- Pin or declare the supported Node.js runtime.
- Create separate `apps/web` and `apps/api` applications.
- Add environment examples and ignore generated, secret, dependency, and local database files.
- Add explicit development, lint, test, and service-start commands.

### Express backend

- Create the Express application and separate server entry point.
- Add a basic application health endpoint.
- Add a dedicated ChromaDB client module.
- Add a dependency-health check that performs a real ChromaDB heartbeat.
- Add basic error handling and automated tests for the approved health behaviour.

### Next.js frontend

- Create a minimal App Router application.
- Add a technical status page that displays frontend, API, and ChromaDB connectivity.
- Keep final visual design, chat behaviour, and document-management interfaces out of scope.

### ChromaDB local runtime

- Install the approved JavaScript client and local CLI dependency.
- Configure a persistent development data directory.
- Provide a repeatable command for starting the local ChromaDB server.
- Verify connectivity through the Express-owned ChromaDB client boundary.

### Documentation

- Update this document with approved decisions and exact implementation scope before coding.
- Update the README with commands only after those commands have been executed successfully.
- Record files changed, verification evidence, problems, and lessons after implementation.
- Synchronize this milestone's status with `docs/SupportLens_plan.md`.
- Create or update a research document only when a meaningful experiment, comparison, failure, or architectural decision requires it.

## Explicitly out of scope

- Document upload or storage.
- PDF, Markdown, or plain-text extraction.
- Text cleaning or chunking.
- Embedding generation or model selection.
- Real document collections or vector retrieval.
- Prompt construction or answer generation.
- LLM provider integration or API keys.
- Chat, Documents, or Retrieval Debugger product interfaces.
- Authentication, authorization, or tenancy.
- Evaluation datasets or metrics.
- Production deployment.

## Concepts to learn and demonstrate

- npm workspace boundaries and scripts.
- Separation between frontend, backend, and vector-database responsibilities.
- Environment-based service configuration.
- Health checks versus dependency-readiness checks.
- ChromaDB client-server operation and heartbeat verification.
- Testable Express application structure.
- Reproducible local-development setup.

## Proposed pass/fail gate

Milestone 0 passes only when all approved checks succeed from a clean local setup:

1. The documented Node.js version is active.
2. Workspace dependencies install successfully.
3. Local ChromaDB starts with the configured persistence path.
4. The Express health endpoint returns the approved success response.
5. The dependency-health check confirms a real ChromaDB heartbeat.
6. The Next.js status page displays the verified API and ChromaDB states.
7. Approved lint checks pass.
8. Approved automated tests pass.
9. The documented start and verification commands have been executed successfully.
10. Actual evidence, changed files, problems, and lessons are recorded below.

A rendered frontend without verified Express-to-ChromaDB connectivity does not pass this milestone.

## Approved implementation decisions

To be completed after the required discussion.

## Approved files and dependencies

To be completed before implementation begins.

## Implementation record

To be completed during and after implementation. Do not record expected work as completed work.

## Verification evidence

To be completed from actual command output and observed behaviour.

## Problems encountered and decisions made

To be completed when real issues or meaningful decisions occur.

## Lessons learned

To be completed after implementation and verification.
