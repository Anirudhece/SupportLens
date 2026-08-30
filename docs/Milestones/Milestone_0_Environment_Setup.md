# Milestone 0 — Environment Setup

## Status

**Complete**

All approved implementation and verification gates passed on 2026-08-30.

## Goal

Establish the SupportLens application foundation and prove minimal connectivity across:

```text
Next.js frontend
      ↓ HTTP
Express backend
      ↓ selected backend-owned client
      ├── HTTP → Local ChromaDB server
      └── HTTPS → Chroma Cloud
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
- Local ChromaDB runs in client-server mode, uses a persistent local data directory, and remains the default development target.
- The technical status page also supports an optional Chroma Cloud target using backend-only credentials.
- The initial implementation does not use LangChain or LlamaIndex.

## Questions that must be discussed before implementation

The required discussions currently have the following status:

1. **Resolved:** Exact npm workspace and source-directory layout.
2. **Resolved:** Development ports and environment-variable names for the web app, API, and ChromaDB.
3. **Resolved:** Separate service commands plus one orchestrated development command.
4. **Resolved:** Testing approach for the Express application and ChromaDB connectivity.
5. **Resolved:** No linting or formatting dependency in Milestone 0.
6. **Resolved:** No formal environment-validation layer or dependency in Milestone 0.
7. **Resolved:** Store local ChromaDB runtime data under `.local/chroma` and ignore `/.local/` in Git.
8. **Resolved:** The frontend status page calls Express directly from the browser.
9. **Resolved:** ChromaDB connectivity uses a separate dependency-health endpoint.
10. **Resolved:** Install latest stable Node.js 24-compatible dependencies and commit the resolved lockfile.

For each question, the agent must explain the practical options and trade-offs, record the user's decision in this document, and update the implementation scope before requesting approval.

## Approved implementation scope

The following scope reflects the resolved architecture decisions and the implementation plan approved by the user.

### Repository foundation

- Create the root npm workspace configuration.
- Pin or declare the supported Node.js runtime.
- Create separate `frontend` and `backend` applications.
- Add environment examples and ignore generated, secret, dependency, and local database files.
- Add explicit development, test, and service-start commands.

### Express backend

- Create the Express application and separate server entry point.
- Add a basic application health endpoint.
- Add backend-owned local and Cloud ChromaDB clients behind one target-selection boundary.
- Add a dependency-health check that performs a real heartbeat against the allowlisted target selected by the frontend.
- Reject unknown ChromaDB targets and report an unconfigured Cloud target without exposing secrets.
- Add basic error handling and automated tests for the approved health behaviour.

### Next.js frontend

- Create a minimal App Router application.
- Add a technical status page that displays frontend, API, and ChromaDB connectivity.
- Add Local and Chroma Cloud radio controls; Local is selected by default.
- Display checking, connected, unreachable, and not-configured dependency states.
- Keep final visual design, chat behaviour, and document-management interfaces out of scope.

### ChromaDB runtimes

- Install the approved JavaScript client and local CLI dependency.
- Configure a persistent development data directory.
- Provide a repeatable command for starting the local ChromaDB server.
- Configure Chroma Cloud through backend-only environment variables.
- Verify real Local and Cloud heartbeats through the Express-owned ChromaDB client boundary.
- Keep both targets isolated so one target's failure does not prevent checking the other.

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
- LLM provider integration or LLM API keys.
- ChromaDB collection creation, document synchronization, or copying data between Local and Cloud.
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
- Local versus managed ChromaDB client configuration and failure isolation.
- Backend-only secret handling for managed infrastructure.
- Testable Express application structure.
- Reproducible local-development setup.

## Proposed pass/fail gate

Milestone 0 passes only when all approved checks succeed from a clean local setup:

1. The documented Node.js version is active.
2. Workspace dependencies install successfully.
3. Local ChromaDB starts with the configured persistence path.
4. The Express health endpoint returns the approved success response.
5. The dependency-health check confirms a real Local ChromaDB heartbeat.
6. With user-configured backend credentials, the dependency-health check confirms a real Chroma Cloud heartbeat.
7. The Next.js status page defaults to Local, can select either target, and displays the verified API and selected ChromaDB state.
8. Approved automated tests pass.
9. The documented start and verification commands have been executed successfully.
10. Actual evidence, changed files, problems, and lessons are recorded below.

A rendered frontend without verified Express-to-Local-ChromaDB and Express-to-Chroma-Cloud connectivity does not pass this milestone.

## Approved implementation decisions

### Decision 1: npm workspace and source-directory layout

- Keep SupportLens as one Git repository with two clearly named npm workspaces: `frontend` and `backend`.
- Use `frontend/src/app` for the Next.js App Router application.
- Use `frontend/src/components` for reusable frontend components.
- Use `frontend/src/apiHandlers` for frontend API-call modules. Files in this directory export functions that communicate with the backend, keeping HTTP request logic out of UI components.
- Use `backend/src/app.js` to construct the testable Express application and `backend/src/server.js` to start the HTTP server.
- Organize backend responsibilities under `backend/src/config`, `backend/src/clients`, `backend/src/routes`, and `backend/src/middleware`.
- Keep backend automated tests under `backend/tests`.
- Do not add a shared workspace until the project has real code or contracts that need to be shared.

Approved repository shape:

```text
SupportLens/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── apiHandlers/
│   ├── public/
│   ├── package.json
│   ├── next.config.js
│   └── .env.example
├── backend/
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/
│   │   ├── clients/
│   │   ├── routes/
│   │   └── middleware/
│   ├── tests/
│   ├── package.json
│   └── .env.example
├── docs/
├── package.json
├── .nvmrc
├── .gitignore
└── README.md
```

The exact files within these directories remain subject to the approved Milestone 0 scope. No application scaffold is created during the decision phase.

### Decision 2: JavaScript module system

- Use ECMAScript modules (ESM) in both the `frontend` and `backend` workspaces.
- Use `import` and `export` syntax throughout application code, configuration, and tests.
- Declare `"type": "module"` in the relevant package manifests.
- Do not introduce CommonJS files or patterns such as `.cjs`, `require()`, or `module.exports`.

### Decision 3: Development ports and environment variables

- Run the Next.js frontend on port `3000`.
- Run the Express backend on port `4000`.
- Run the local ChromaDB server on its conventional port `8000`.
- Configure the frontend with `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`.
- Configure the backend local client with `CHROMA_LOCAL_HOST`, `CHROMA_LOCAL_PORT`, and `CHROMA_LOCAL_SSL`.
- Configure the backend Cloud client with `CHROMA_API_KEY`, `CHROMA_TENANT`, `CHROMA_DATABASE`, and an optional `CHROMA_CLOUD_HOST` for region selection.
- Use `localhost`, port `8000`, and `false` as the respective Local ChromaDB defaults.
- Configure `FRONTEND_ORIGIN=http://localhost:3000` as the allowed local frontend origin.

### Decision 4: Frontend-to-backend request boundary

- The browser calls the Express backend directly through exported functions in `frontend/src/apiHandlers`.
- Frontend UI components do not contain raw HTTP-request construction.
- Express enables CORS for the configured `FRONTEND_ORIGIN`; it does not use an unrestricted wildcard origin.
- The browser does not communicate directly with ChromaDB.
- The browser sends only the allowlisted target value `local` or `cloud`; Cloud credentials never enter frontend code or responses.

### Decision 5: Development process startup

- Provide separate commands for starting the frontend, backend, and ChromaDB processes so each service can be run and debugged independently.
- Also provide one root development command that starts all three services together.
- Use `concurrently` as a root development dependency for the combined command; a heavier monorepo orchestration tool is not required in Milestone 0.

### Decision 6: Health endpoint design

- `GET /health` is the Express liveness endpoint. It confirms that the API process is responding and does not contact ChromaDB.
- `GET /health/dependencies?target=local|cloud` is the dependency-health endpoint. It performs a real heartbeat against the selected target.
- The dependency-health endpoint returns HTTP `200` when ChromaDB is reachable and HTTP `503` when the dependency check fails.
- An unknown target returns HTTP `400`; missing Cloud configuration produces a safe not-configured response without returning credential values.
- These endpoints may be included in operational checks, but testing them under load measures only the health-check paths rather than representative RAG workload performance.

### Decision 7: Testing approach

- Use Vitest as the automated test runner and Supertest for Express HTTP endpoint tests.
- Structure the Express application so a fake ChromaDB client can be injected into deterministic endpoint tests.
- Add a separate integration or smoke test that requires a running ChromaDB server and verifies a real heartbeat.
- Add an explicitly invoked Cloud integration or smoke test that uses user-configured backend credentials and verifies a real Cloud heartbeat.
- Keep software tests and future RAG evaluations separate: these tests verify application behaviour and connectivity, while evaluations will measure retrieval and answer quality.

### Decision 8: Linting and formatting

- Do not add ESLint, Prettier, or another linting or formatting dependency in Milestone 0.
- Remove linting from the Milestone 0 pass gate; linting and formatting can be reconsidered in a later milestone.

### Decision 9: Environment validation

- Do not add a schema-validation dependency or a formal environment-validation layer in Milestone 0.
- Keep environment access centralized in the backend configuration module so validation can be added later without changing every consumer.

### Decision 10: Dependency version policy

- Install the latest stable dependency versions available at implementation time that are compatible with Node.js 24 LTS.
- Do not select beta, release-candidate, canary, or other prerelease versions.
- Commit `package-lock.json` so the exact resolved dependency tree is reproducible.
- Verify and record the exact versions before installation rather than relying on remembered version numbers.

### Decision 11: Local ChromaDB persistence

- Store persistent local ChromaDB runtime data under `.local/chroma` at the repository root.
- Ignore `/.local/` in Git so generated database state cannot be committed accidentally.
- Keep this runtime directory separate from future version-controlled sample documents and evaluation datasets.
- Treat deleting `.local/chroma` as an intentional local database reset operation.

### Decision 12: Local and Chroma Cloud selector

- Put Local and Chroma Cloud radio controls only on the technical status page; this is a learning and diagnostic control rather than an end-user product setting.
- Select Local by default.
- The frontend sends only `local` or `cloud` to the Express dependency-health endpoint.
- Express selects a backend-owned `ChromaClient` for Local or `CloudClient` for Chroma Cloud and rejects any other target.
- Keep Chroma Cloud credentials exclusively in the backend environment and never expose them through `NEXT_PUBLIC_` variables, frontend bundles, or API responses.
- Report Cloud as not configured when the required backend credentials are absent.
- Limit Milestone 0 to connectivity checks. Local and Cloud collections remain independent; collection creation, ingestion, synchronization, and data copying are deferred.
- Require observed real heartbeats from both Local and Chroma Cloud before marking the approved dual-target feature complete.

All required architecture discussions and the exact implementation plan are approved.

## Approved files and dependencies

### Runtime

- Node.js `24.20.0`, recorded in `.nvmrc` and constrained to Node 24 in the root package manifest.
- npm workspaces at `frontend` and `backend`.

### Exact dependencies

| Workspace | Dependency | Version |
| --- | --- | --- |
| Root development | `concurrently` | `10.0.5` |
| Frontend | `next` | `16.3.3` |
| Frontend | `react` | `19.2.8` |
| Frontend | `react-dom` | `19.2.8` |
| Backend | `express` | `5.2.1` |
| Backend | `cors` | `2.8.6` |
| Backend | `chromadb` | `3.5.0` |
| Backend development | `vitest` | `4.1.11` |
| Backend development | `supertest` | `7.2.2` |

Dependency versions are pinned exactly. Axios, dotenv, Zod, Nodemon, ESLint, Prettier, LangChain, and LlamaIndex are not included.

### Files approved for creation

```text
package.json
package-lock.json
.nvmrc
.gitignore
frontend/package.json
frontend/next.config.js
frontend/.env.example
frontend/src/app/layout.js
frontend/src/app/page.js
frontend/src/app/globals.css
frontend/src/components/ServiceStatus.js
frontend/src/apiHandlers/healthApi.js
backend/package.json
backend/.env.example
backend/src/app.js
backend/src/server.js
backend/src/config/environment.js
backend/src/clients/chromaClients.js
backend/src/routes/healthRoutes.js
backend/src/middleware/errorHandler.js
backend/tests/health.test.js
backend/tests/chroma.local.integration.test.js
backend/tests/chroma.cloud.integration.test.js
```

### Files approved for modification

- `README.md`, after commands and behaviour have been verified.
- `docs/Milestones/Milestone_0_Environment_Setup.md`, for status and actual evidence.
- `docs/SupportLens_plan.md`, to synchronize milestone status.

## Implementation record

Implementation began after the user approved the exact plan on 2026-08-29. Application-code work was delegated to a GPT-5.6 Luna implementation agent as required by `AGENTS.md`.

Implemented work:

- Created the root npm workspace with `frontend` and `backend` workspaces, exact dependency pins, Node 24 enforcement, and a committed lockfile.
- Added individual development commands for Next.js, Express, and local ChromaDB plus one `concurrently`-powered root command.
- Added the Next.js App Router status page, Local/Chroma Cloud radio controls, frontend status components, and exported API-call functions under `frontend/src/apiHandlers`.
- Added the testable Express application and separate server entry point.
- Added centralized environment access, loopback-default API binding, restricted CORS, liveness and bounded dependency-health routes, safe error handling, and backend-owned Local and Cloud Chroma clients.
- Added deterministic Supertest/Vitest coverage and separate real Local and Cloud integration commands.
- Configured local ChromaDB persistence under `.local/chroma` and protected generated state and secrets through `.gitignore`.
- Disabled Next.js automatic agent-rule file generation so nested generated instructions cannot override the repository's approved `AGENTS.md` workflow.

Milestone 0 is **Complete**. Real Local and Chroma Cloud heartbeats passed, and the user completed the interactive browser verification.

## Verification evidence

Evidence collected on 2026-08-29:

- `nvm install 24.20.0` installed Node.js `v24.20.0` with npm `11.19.0`; both versions were observed after activation.
- `npm install` produced `package-lock.json`; `npm ls --depth=0` confirmed every approved direct dependency at its exact pinned version.
- npm reported 179 audited packages and 0 vulnerabilities after the successful install retry.
- The original `npm test` run passed 1 test file and all 6 deterministic backend tests.
- `npm run build` completed the Next.js `16.3.3` production build successfully and generated the `/` route as static content.
- `npm run dev:chroma` started ChromaDB at `http://localhost:8000`, reported `.local/chroma` as its data path, and created `.local/chroma/chroma.sqlite3`.
- `npm run test:integration:local` passed its real Express-to-Local-ChromaDB heartbeat test.
- `npm run dev` started ChromaDB, Express on port `4000`, and Next.js on port `3000` from one command; interrupting it stopped the grouped services.
- Direct HTTP verification returned `200` from the Next.js page and Express liveness endpoint.
- Direct HTTP verification returned `200` with `{"target":"local","status":"connected"}` for the Local dependency check.
- Direct HTTP verification returned `503` with `{"target":"cloud","status":"not-configured"}` when Cloud credentials were absent.
- Responses to approved-origin requests contained `Access-Control-Allow-Origin: http://localhost:3000`.
- The rendered HTML contained the Local and Chroma Cloud radio controls, with Local selected by default, plus frontend, API, and ChromaDB status cards.
- `npm run test:integration:cloud` failed intentionally and safely because `backend/.env` and the three required Cloud values were absent. No secret value was printed.
- `git diff --check` passed, no authored CommonJS pattern was found, no real Chroma API key was present, generated Next agent files were absent after restart, and `.local`, `.next`, and real environment files were confirmed ignored.

Additional review-fix evidence collected on 2026-08-30:

- `npm test` passed 1 test file and all 9 backend tests under Node.js `v24.20.0` and npm `11.19.0`.
- The expanded tests verify the `127.0.0.1` bind-host default, explicit host and timeout overrides, and a secret-safe HTTP `503` when a heartbeat never resolves.
- A real backend start reported `SupportLens API listening on http://127.0.0.1:4000`, and a direct loopback request to `/health` returned `{"status":"ok","service":"backend"}`.
- The dependency-health response is bounded to `5000` milliseconds by default and can be configured through `HEALTH_HEARTBEAT_TIMEOUT_MS`.
- The user configured the three required Chroma Cloud values in the ignored backend environment file. Their presence was checked without displaying any credential value.
- `npm run test:integration:cloud` passed its real Express-to-Chroma-Cloud heartbeat test: 1 test file and 1 test passed in 1.76 seconds under Node.js `v24.20.0`.
- The combined local services were started again before the browser retry and stopped cleanly afterward.
- The user manually verified the hydrated status page in a browser: Local was selected and connected by default, Chroma Cloud became connected when selected, and switching back to Local restored the connected Local state.

## Completion gate result

All ten approved Milestone 0 pass/fail checks are satisfied. No Milestone 0 verification work remains.

## Problems encountered and decisions made

- The host shell initially used Node.js `v25.9.0`, which did not satisfy the approved Node 24 runtime. Node `v24.20.0` was installed and activated through the existing NVM setup before creating the lockfile.
- The first npm installation attempt left a partial `node_modules` tree without a lockfile. Re-running the same approved installation completed successfully, produced the lockfile, resolved the exact dependency tree, and reported no vulnerabilities; no unapproved dependency was introduced.
- Supertest initially failed with `listen EPERM` because the restricted execution sandbox blocked ephemeral local sockets. The identical test command passed all assertions when rerun with localhost socket permission.
- Next.js generated `frontend/AGENTS.md` and `frontend/CLAUDE.md` during its first development start. These files were outside the approved scope and could supersede root instructions, so `agentRules: false` was added to `next.config.js`; the generated files were removed and did not return after restart.
- The Cloud test was designed to fail clearly rather than skip successfully when credentials are missing. This prevents the milestone gate from producing a false positive.
- The browser-control plugin failed before navigation because of a local plugin cache mismatch. A retry after the Cloud heartbeat passed reached the same failure: the installed browser plugin was current, but its service attempted to load a missing older cached version. The user subsequently completed the approved interactive check manually, so this external tooling problem no longer blocks the milestone.
- Code review found that an unbounded ChromaDB heartbeat could leave the dependency-health response pending and that Express did not explicitly bind to loopback. The implementation now bounds the API wait and defaults `BACKEND_HOST` to `127.0.0.1`.
- ChromaDB JavaScript client `3.5.0` does not accept a per-call abort signal for `heartbeat()`. The API stops waiting after its configured timeout, while an already-started SDK operation may finish in the background; the implementation and comments state this limitation instead of claiming transport cancellation.

## Lessons learned

- Liveness and dependency readiness answer different operational questions: Express can be alive even when one Chroma target is unavailable.
- Injecting Chroma clients into the Express application keeps endpoint tests deterministic while preserving separate real integration gates.
- A frontend infrastructure selector must send only an allowlisted target; credentials and client construction remain backend responsibilities.
- Local and Cloud targets can share a narrow health interface without implying that their collections or data are synchronized.
- Exact runtime and package pins plus a committed lockfile make the environment reproducible, but actual command execution is still necessary to expose installation and runtime-specific failures.
- A skipped or placeholder integration test is not evidence that an external service works; the real Cloud gate must require real credentials and a successful heartbeat.
- Health checks need explicit response-time bounds. A dependency call that never settles is operationally different from a fast connection refusal, and both must produce a usable API result.
- Binding a local development API explicitly to loopback is separate from CORS: CORS controls browser response access, while the bind address controls which network interfaces accept connections.
