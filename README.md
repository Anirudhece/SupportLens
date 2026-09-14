# SupportLens

SupportLens is a production-oriented RAG knowledge assistant being built as an explicit, measurable learning project. Milestones 0–2 are complete. Milestone 3 is in progress: metadata filtering, opt-in hybrid retrieval, and opt-in local reranking have been implemented and compared, with the final browser-upload and production-setting checkpoints pending.

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

Production ingestion uses heading-aware packing with a 240-token maximum and 15-token overlap. Packing stays within each Markdown heading, so overlap never crosses into another section. The document registry stores the active collection name independently for Local and Cloud; normal ingestion, retrieval, seeding, and evaluation resolve that pointer for every operation. The fixed M1/M2 fallback collections and up to five recent active generations are retained for rollback.

New uploads may carry optional exact-match `product`, `documentType`, and `documentVersion` labels. These are separate from the numeric upload revision. Existing unlabeled documents remain available without filters but do not match a requested label. Retrieval defaults to vector-only; `hybrid` and `reranked` are explicit opt-in modes. Hybrid uses Chroma's case-sensitive document-text matching plus vector search and RRF, not BM25. Reranking runs the local `Xenova/ms-marco-MiniLM-L-6-v2` cross-encoder; its model files are downloaded once on first use. Filters restrict retrieval, but they are not authorization or tenant isolation.

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

Document upload uses multipart form data with one `file`, an optional `target`, optional `product`, `documentType`, and `documentVersion` strings, and a 5 MB maximum. Retrieval and answer requests accept JSON with `question`, `target`, optional `filters` containing those exact-label fields, optional `mode` (`vector`, `hybrid`, or `reranked`), and optional integer `nResults`/`topK` from 1 to 10. Unknown filter fields and unsupported modes return HTTP 400. Filtered no-match answers fall back without calling Gemini.

## Seed, reindex, and evaluate

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

Rebuild registered documents into the current M2 collection for one target:

```bash
npm run reindex -- local
npm run reindex -- cloud
```

Reindexing preserves each document's original target. It embeds and writes in batches of 64, capped by Chroma's reported maximum; builds and verifies a uniquely named candidate collection; then atomically switches the target's active pointer and document chunk metadata. A failed run deletes only its candidate, while the prior active collection and registry state remain available. Back up `backend/.local/documents.json` before a manual migration. Do not run a target reindex unless its Chroma service and registered source files are available.

Reproduce the controlled Local chunking comparison:

```bash
npm run experiment:chunking
```

The experiment uses isolated temporary collections and compares recursive size, recursive overlap, and heading-aware packing against the same synthetic corpus and fixed questions.

Reproduce the Milestone 3 controlled Local retrieval comparison after starting Local Chroma:

```bash
npm run experiment:retrieval
```

It uses version-controlled synthetic documents/cases, a uniquely named temporary collection, and the production heading-aware chunks, embeddings, and keyword term extraction. It prints vector-only, keyword-only, hybrid, and reranked metrics, then writes per-case stage/filter/latency evidence under ignored `backend/.local/evals/` and deletes only its own collection. The measured M3 comparison did not justify changing the vector-only production default; see [Research M3](docs/Research/Research_M3_Advanced_Retrieval.md).

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

For the opt-in synthetic live Gemini answer and empty-context check, with a configured `GEMINI_API_KEY`:

```bash
RUN_LIVE_GEMINI=true npm run test --workspace backend -- tests/chroma.rag.integration.test.js
```

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

Milestone 2 was verified on 2026-09-05:

- The final controlled Local matrix evaluated 25 cases across 10 configurations. Heading-aware `240/15` improved Recall@1 from `0.7895` to `0.8947`, Recall@3 from `0.9474` to `1.00`, MRR from `0.8728` to `0.9474`, and exact-ID Recall@1 from `0.6667` to `0.8333` compared with recursive `200/30`.
- The selected strategy preserved Recall@4, Recall@5, required-fact coverage, and required-fact completion at `1.00`, while producing 35 chunks versus 49 for recursive `240/15` in the final strategy comparison.
- Migration produced 46 Local chunks from 10 documents and 9 Cloud chunks from 9 synthetic documents. M1 collections were preserved.
- Post-migration Local and Cloud retrieval both achieved Recall@1/Recall@3/MRR/exact-ID Recall@1 of `1.00` on the fixed 15-case set.
- The live Gemini regression passed 8/8 supported and 7/7 unsupported/adversarial cases with citation validity and expected-status accuracy of `1.00`.
- Deterministic tests passed 93 tests with two opt-in skips; the production frontend build, Local/Cloud integrations, and rendered Local/Cloud debugger and Chat checks passed.

Milestone 2 reindex safety was hardened and reverified on 2026-09-06 after a post-commit review:

- Reindex now keeps the active collection readable while a candidate is built and verified, then atomically switches the registry pointer; a failed candidate cannot delete the active collection.
- Repository operations resolve the current pointer, preventing a running process from remaining attached to a deleted Chroma collection UUID. Seed and evaluation commands use the same pointer-aware repository.
- Registry and target locks use atomic owner publication, immutable per-owner markers, heartbeat leases, bounded same-host PID liveness grace, ownership-atomic stale-lock recovery, and ownership-checked release.
- Reindex embedding and Chroma writes use bounded batches of 64, capped by Chroma's server-reported maximum.
- Ambiguous registry-write outcomes are resolved by rereading the durable pointer before candidate cleanup; rejected Chroma collection promises are evicted so later requests can retry; rollback history is bounded and evicted generations are cleaned only after a successful activation.
- Deterministic tests passed 110 tests with two opt-in skips; the production build and all four Local/Cloud heartbeat and RAG integration commands passed.
- Safe reindex produced active 46-chunk Local and 9-chunk Cloud candidates while preserving both preceding active generations and the fixed M2 fallbacks at their original 46 and 9 chunks. The fixed retrieval suite remained `1.00` on Recall@1, Recall@3, MRR, and exact-ID Recall@1 for both targets.
- A live Cloud answer for `What does PAYMENT_4027 mean?` returned `answered`, cited `payment-errors.md`, and used `gemini-3.5-flash-lite` through the new active pointer.

See [Milestone 2](docs/Milestones/Milestone_2_Chunking_Experiments.md) and [Research M2](docs/Research/Research_M2_Chunking_Strategy_Comparison.md) for the controlled matrix, rejected pilots, migration safeguards, failures, and final evidence.

Milestone 3 is not yet marked complete. Its controlled eight-case Local retrieval experiment found no overall Recall@1/MRR improvement from hybrid or reranking; reranking improved one of two exact-ID top ranks but increased latency and moved one paraphrase down. Local/Cloud metadata-filtered retrieval and the targeted synthetic Gemini guardrail passed. The rendered browser upload with labels remains pending because the browser-control session could not attach a local file. See [Milestone 3](docs/Milestones/Milestone_3_Advanced_Retrieval.md) and [Research M3](docs/Research/Research_M3_Advanced_Retrieval.md) for the exact results and limitations.
