# SupportLens

SupportLens is a production-oriented RAG knowledge assistant being built as an explicit, measurable learning project. Milestones 0 and 1 are complete. Milestone 1 establishes the first end-to-end document, embedding, retrieval, grounded-answer, citation, visibility, guardrail, and evaluation baseline.

## Current architecture

```text
Next.js Documents / Chat / Retrieval Debugger
                    ↓ HTTP
                 Express
                    ↓
   load → normalize → chunk → local MiniLM embed
                    ↓
        Local ChromaDB or Chroma Cloud
                    ↓
       retrieve → guardrails → Gemini answer
```

Embedding generation remains application-owned. `all-MiniLM-L6-v2` runs on the backend machine and supplies precomputed 384-dimensional vectors to either Chroma target. Selecting Chroma Cloud does not move embedding inference to the cloud. Local and Cloud collections are independent.

Gemini 3.5 Flash-Lite is configured for single-turn, non-streaming structured answers without search or other tools. No larger model is used as an automatic fallback.

## Prerequisites

- NVM
- Node.js `24.20.0`
- npm `11.19.0`, included with the approved Node release
- A Chroma Cloud account only for Cloud storage and integration checks
- A Gemini API key and available quota only for grounded answers and answer evaluation

Activate the repository runtime and install the pinned dependencies:

```bash
nvm install
nvm use
npm ci
```

The first embedding or ingestion request downloads `all-MiniLM-L6-v2` once. Later requests use the local model cache.

## Environment configuration

The local Chroma defaults work without real environment files. To configure the applications explicitly:

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

For grounded answer generation, also set:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GENERATION_MAX_OUTPUT_TOKENS=1024
```

Gemini free-tier development must use only synthetic or otherwise non-sensitive data. Do not upload confidential documents under the current provider configuration. Never place Chroma or Gemini secrets in a `NEXT_PUBLIC_` variable or commit a real environment file.

The Express API binds to `127.0.0.1` by default. Local uploaded originals and the JSON document registry persist under `backend/.local/`; Local Chroma data persists under root `.local/chroma/`. Both paths are ignored by Git.

## Start the application

Start the frontend, backend, and local ChromaDB server together:

```bash
npm run dev
```

The services run at:

- Frontend: `http://localhost:3000`
- Express API: `http://localhost:4000`
- Local ChromaDB: `http://localhost:8000`

The services can also be started independently:

```bash
npm run dev:frontend
npm run dev:backend
npm run dev:chroma
```

Application routes:

- `/` — Express and Chroma connectivity status
- `/documents` — upload Markdown, text, or PDF documents and inspect ingestion results
- `/retrieval-debugger` — inspect ranked chunks, scores, metadata, target, and latency
- `/chat` — request a grounded answer and inspect citations, model, timing, and usage

## API surface

```text
GET  /health
GET  /health/dependencies?target=local|cloud
POST /api/v1/documents
GET  /api/v1/documents?target=local|cloud
POST /api/v1/retrieval
POST /api/v1/answers
```

Document upload uses multipart form data with one `file`, an optional `target`, and a 5 MB maximum. Retrieval and answer requests accept JSON with `question`, `target`, and optional integer `nResults`/`topK` from 1 to 10.

## Seed and evaluate the baseline

With the selected Chroma target available, seed the nine synthetic support documents:

```bash
npm run seed -- local
npm run seed -- cloud
```

Run the fixed 15-case baseline:

```bash
npm run eval -- local
npm run eval -- cloud
```

The evaluator reports Recall@1, Recall@3, MRR, exact-identifier retrieval, per-case latency, expected answer status, citation validity, fallback behaviour, and provider usage. When `GEMINI_API_KEY` is absent, answer metrics are explicitly marked skipped rather than passed.

## Verification commands

Run deterministic backend tests and build the frontend:

```bash
npm test
npm run build
```

With the Local Chroma server running:

```bash
npm run test:integration:local
npm run test:integration:rag:local
```

With valid Chroma Cloud values:

```bash
npm run test:integration:cloud
npm run test:integration:rag:cloud
```

The RAG integration commands create uniquely named collections, exercise real local MiniLM precomputed embeddings, and clean the collections afterward. Cloud commands fail clearly when required credentials are absent.

## Current evidence

Baseline verified on 2026-09-01 and the post-completion chunk-loss regression reverified on 2026-09-02 with the pinned runtime:

- Clean `npm ci`: passed.
- Deterministic tests: 37 passed; two opt-in live cases skipped by default.
- Frontend production build: passed for all four application routes.
- Fresh MiniLM download and embedding: 384 dimensions, norm `1`.
- Real Local and Chroma Cloud heartbeat plus RAG ingestion/retrieval: passed.
- Retrieval baseline on both targets: Recall@1 `1.00`, Recall@3 `1.00`, MRR `1.00`, and exact-identifier Recall@1 `1.00` on the deliberately small synthetic corpus.
- Live Local answer and guardrail baseline: 8/8 supported cases answered, 7/7 unsupported or adversarial cases returned `insufficient_context`, citation validity `1.00`, and expected-status accuracy `1.00`.
- Manual Documents → Retrieval Debugger → Chat verification: passed for Local and Chroma Cloud, including a grounded cited answer on each target and an unsupported-question fallback.
- Post-completion Markdown regression: fixed silent loss of punctuation-heavy content such as scoped npm packages and semantic versions; the affected Local document was re-ingested and the user confirmed that Chat displayed all six exact approved dependencies.

See [Milestone 1](docs/Milestones/Milestone_1_Basic_Vector_RAG.md) for the approved gate and [Research M1](docs/Research/Research_M1_Basic_RAG_Baseline.md) for measured evidence, limitations, and failures.
