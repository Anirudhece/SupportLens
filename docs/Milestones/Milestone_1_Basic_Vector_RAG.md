# Milestone 1 — Basic Vector RAG

## Status

- **Status:** Complete
- **Plan approved:** 2026-09-01
- **Implementation started:** 2026-09-01
- **Completed:** 2026-09-01

## Goal

Build the first complete, explicit retrieval-augmented generation path for SupportLens:

```text
Upload Markdown, text, or PDF
      ↓
Extract and normalize text
      ↓
Create bounded, traceable chunks
      ↓
Generate local MiniLM embeddings
      ↓
Store vectors and metadata in Local or Cloud ChromaDB
      ↓
Embed a question and retrieve the nearest chunks
      ↓
Apply scope and retrieval guardrails
      ↓
Generate a grounded Gemini answer
      ↓
Validate citations and expose retrieval evidence
```

This milestone must produce a usable baseline, not an optimized final RAG system. Its recorded retrieval, answer, guardrail, latency, and usage results become the comparison point for Milestone 2.

## Why this milestone is necessary

Milestone 0 proved that the browser, Express API, and both ChromaDB targets can communicate. It intentionally excluded document ingestion, embeddings, retrieval, and answer generation.

Milestone 1 connects those explicit stages into one vertical slice. Building the stages without LangChain or LlamaIndex makes it possible to explain where failures occur and to change chunking, embeddings, retrieval, prompting, or generation independently in later milestones.

## Concepts to learn and demonstrate

- The difference between an embedding model and an answer-generation LLM.
- Application-owned embedding generation versus vector-database storage.
- Token-aware, boundary-preserving document chunking.
- Traceable chunk identifiers and metadata.
- Vector similarity retrieval with visible scores.
- The separation between retrieval failures and answer-generation failures.
- Structured grounded-answer generation and server-side citation validation.
- Application guardrails, provider safety filters, and their limitations.
- Retrieval metrics, adversarial cases, latency, and token-usage evidence.
- Local versus managed vector storage using the same embeddings and application pipeline.

## Approved decisions

### Documents and corpus

- Support Markdown, plain-text, and PDF uploads.
- Implement Markdown and text extraction first, followed by PDF extraction with page metadata.
- Accept one document per request with a maximum size of 5 MB.
- Include 8–10 synthetic SaaS support documents for repeatable demonstrations and evaluation.
- Store uploaded originals under ignored `.local/uploads/` paths.
- Store a small durable JSON document registry under ignored `.local/` state.
- Keep the storage boundary replaceable so a future object store such as S3 can replace local files without rewriting ingestion.

### Identity and re-ingestion

- Compute a SHA-256 checksum for every uploaded document.
- Treat identical content as an idempotent duplicate rather than creating duplicate chunks.
- Treat changed content as a new document version.
- Deletion, replacement, and version cleanup are outside this milestone.

### Chunking baseline

- Use a recursive strategy that prefers headings, paragraphs, sentences, words, and finally characters.
- Measure chunk size with the tokenizer compatible with `all-MiniLM-L6-v2`.
- Set the Milestone 1 baseline to a maximum of 200 WordPiece tokens with 30 tokens of overlap.
- Preserve source, section, page, version, document identifier, checksum, and chunk index metadata where available.
- Treat these parameters as a safe baseline rather than an optimum. Milestone 2 will compare alternatives.

The previously discussed 500-token baseline was rejected after verifying that `all-MiniLM-L6-v2` truncates inputs above 256 WordPiece tokens. The lower limit prevents silently embedding only the beginning of a chunk.

### Embeddings

- Use the open-weight `all-MiniLM-L6-v2` model through Chroma's TypeScript default-embedding package.
- Run the model locally in the Express process, including when Chroma Cloud is selected.
- Accept the one-time local model download required by the embedding runtime.
- Call the embedding provider explicitly and supply precomputed vectors to ChromaDB.
- Do not let ChromaDB hide the `generateEmbeddings()` application stage.
- Use a dedicated collection compatible with this model and cosine similarity.
- Never mix vectors from different embedding models in one collection.

### Vector storage targets

- Preserve the Local/Cloud selector introduced in Milestone 0.
- Apply the selected target to ingestion, retrieval, and answering.
- Keep Local and Chroma Cloud collections independent; do not synchronize or copy records automatically.
- Use the same chunking, embedding, metadata, and collection schema for both targets.

### Answer generation

- Use the official Google GenAI JavaScript SDK.
- Use stable `gemini-3.5-flash-lite` as the default answer model.
- Keep the model configurable through backend environment configuration.
- Use single-turn, non-streaming generation in this milestone.
- Require structured output that identifies either `answered` or `insufficient_context` and supplies retrieved citation identifiers.
- Do not enable Google Search, URL context, code execution, function tools, or another external-grounding path.
- Do not silently fall back to a larger model.
- If evidence shows inadequate quality, compare the same cases against Gemini 3.7 Flash and seek approval before changing the baseline.

### Free-tier and data boundary

- Use Gemini's free tier for development and portfolio demonstrations.
- Use only synthetic or otherwise non-sensitive data while relying on free-tier processing.
- Show a warning that confidential documents must not be uploaded under the current provider configuration.
- Treat quota exhaustion as a recoverable provider error and do not repeatedly retry a depleted free allowance.

### Guardrails

- Instruct the model to answer only from supplied retrieved context.
- Mark retrieved document content as untrusted data rather than instructions.
- Return a deterministic fallback without calling Gemini when no chunks are available.
- Require `answered` or `insufficient_context` structured status.
- Require every answered response to cite identifiers from the retrieved set.
- Reject fabricated or unknown citation identifiers in Express.
- Bound question length, file size, top-k, provider time, and response size.
- Configure conservative Gemini harm filters and handle provider safety blocks explicitly.
- Add adversarial cases for off-topic knowledge, prompt injection, system-prompt extraction, citation spoofing, and secret extraction.
- Do not claim that prompt instructions or provider filters guarantee perfect protection. Record failures and strengthen them using evidence.

### Ingestion execution and scale

- Run ingestion synchronously for one small document at a time.
- Return the document identifier, ingestion result, chunk count, target, and safe errors.
- Do not add a job queue, distributed worker, or production-scale orchestration in this milestone.

### Frontend surfaces

- Add a minimal Documents screen for upload and ingestion results.
- Add a minimal Chat screen for grounded answers and citations.
- Add a Retrieval Debugger for ranked chunks, scores, metadata, selected context, and timing.
- Keep browser-to-Express calls inside `frontend/src/apiHandlers`.
- Preserve the technical status page and Local/Cloud target selection.

### Evaluation baseline

- Add approximately 12–15 fixed seed cases, including at least five adversarial or unsupported cases.
- Measure Recall@1, Recall@3, and Mean Reciprocal Rank separately from answer checks.
- Record exact-identifier retrieval, answer status, citation validity, fallback behaviour, latency, and provider usage.
- Do not invent an overall quality threshold before the first baseline is run.
- Require critical secret, citation-integrity, and unsupported-world-knowledge guardrail cases to pass before completion.

## Approved API surface

```text
POST /api/v1/documents
GET  /api/v1/documents?target=local|cloud
POST /api/v1/retrieval
POST /api/v1/answers
```

The document upload endpoint accepts multipart form data. Retrieval and answer endpoints accept validated JSON. Every target value is validated server-side rather than trusted from the browser.

## Approved dependencies

Add these exact backend runtime dependencies:

- `@chroma-core/default-embed@0.1.9`
- `@huggingface/transformers@3.8.1`
- `@google/genai@2.19.0`
- `multer@2.3.0`
- `pdf-parse@2.4.5`
- `zod@4.5.4`

No frontend dependency is approved for this milestone. Existing Vitest and Supertest dependencies remain the testing foundation.

## Approved implementation scope

### Backend

- Add explicit document loading, normalization, tokenization, chunking, embedding, storage, retrieval, prompting, generation, and guardrail modules.
- Add a backend-owned singleton MiniLM embedding provider so the model is not loaded for every request.
- Add a backend-owned Gemini client and model configuration.
- Add a local original-file store and durable document registry.
- Add a Chroma chunk repository that accepts precomputed embeddings.
- Add the approved versioned routes and safe error mappings.
- Extend configuration and `.env.example` without exposing secrets to the frontend.
- Add seed and evaluation commands.

### Frontend

- Add Documents, Chat, and Retrieval Debugger routes.
- Add shared navigation and target selection.
- Add API handler functions for the approved endpoints.
- Show provider/data-use guidance, loading states, successful results, and safe errors.
- Keep the UI deliberately technical and minimal; final visual design is not part of this milestone.

### Data and evaluation

- Add a version-controlled synthetic support corpus.
- Add a version-controlled Milestone 1 evaluation dataset.
- Keep generated evaluation output and local uploads outside Git.

### Documentation

- Correct obsolete PostgreSQL/pgvector requirements in the PRD.
- Record the approved architecture and provider boundaries in project context.
- Keep this milestone and the master plan synchronized.
- Record actual experiments, failures, metrics, and decisions in `docs/Research/Research_M1_Basic_RAG_Baseline.md`.
- Update the README with actual setup, commands, and verified behaviour after implementation.

## Explicitly out of scope

- Authentication, authorization, tenancy, and deployment.
- Production object storage such as S3.
- Background ingestion queues and distributed workers.
- Document deletion, replacement, synchronization, and version cleanup.
- Multi-turn conversation state and response streaming.
- Metadata-filtering UI and retrieval logic beyond storing future-compatible metadata.
- Hybrid keyword retrieval.
- Reranking.
- A permanent confidence threshold chosen without evidence.
- Claim-level citation verification beyond validated retrieved-chunk identifiers.
- Automatic fallback to Gemini 3.7 Flash or another model.
- LangChain or LlamaIndex.

## Planned files

The approved implementation may create application modules within these paths:

```text
backend/src/chunking/
backend/src/documents/
backend/src/embeddings/
backend/src/evaluation/
backend/src/guardrails/
backend/src/rag/
backend/src/repositories/
backend/src/schemas/
backend/src/scripts/
backend/src/services/
backend/src/storage/
backend/src/routes/
backend/src/middleware/
frontend/src/app/chat/
frontend/src/app/documents/
frontend/src/app/retrieval-debugger/
frontend/src/components/
frontend/src/apiHandlers/
data/sample-knowledge-base/
evals/datasets/
```

Existing configuration, package, application, frontend layout/style, test, README, and planning files may be modified only as required by this scope.

## Verification plan

### Automated software tests

- Document type, size, filename, and path validation.
- Markdown, text, and PDF extraction, including page metadata where available.
- Deterministic checksums, duplicate handling, and durable registry behaviour.
- Token-aware chunk bounds and overlap.
- Embedding-provider and Chroma-repository boundaries with test doubles.
- Retrieval result normalization, ordering, scores, and metadata.
- Prompt construction with untrusted-context separation.
- Structured answer parsing and citation validation.
- Unsupported, adversarial, safety-block, quota, timeout, and secret-safe failures.
- Versioned route validation and response contracts.
- Existing Milestone 0 health behaviour remains passing.

### Real integration checks

- Local Chroma ingestion and retrieval using real MiniLM embeddings.
- Chroma Cloud ingestion and retrieval using the same local embeddings.
- A real Gemini structured grounded answer when a valid API key and free quota are available.
- Opt-in integration commands must fail clearly when configuration is absent and must never print secrets.
- Dedicated integration collections must be uniquely scoped and cleaned up safely when a test creates them.

### Evaluation and browser checks

- Seed the synthetic corpus independently into Local and Cloud targets.
- Run the fixed Milestone 1 cases and record retrieval and guardrail results.
- Complete a manual Documents → Retrieval Debugger → Chat flow for Local and Cloud.
- Verify that the UI shows sources, scores, citations, target, timing, model, and safe failures as applicable.

## Pass/fail gate

Milestone 1 is complete only when all of the following are true:

1. A clean install succeeds with the approved Node.js runtime and pinned dependencies.
2. All existing and new deterministic tests pass.
3. The frontend production build passes.
4. Markdown, text, and PDF ingestion produce traceable bounded chunks.
5. Real MiniLM ingestion and retrieval succeed against Local ChromaDB.
6. Real MiniLM ingestion and retrieval succeed against Chroma Cloud.
7. A real Gemini 3.5 Flash-Lite call returns valid structured grounded output.
8. Answer citations are restricted to retrieved chunk identifiers.
9. Critical adversarial cases do not reveal secrets or produce unsupported world-knowledge answers.
10. The fixed baseline evaluation runs and records Recall@1, Recall@3, MRR, latency, citation, fallback, and usage evidence without fabricating a quality claim.
11. Manual browser verification passes for Documents, Chat, and Retrieval Debugger on Local and Cloud.
12. The milestone, research record, README, PRD, project context, and master plan contain the actual implementation and verification evidence.

If Flash-Lite cannot satisfy the answer or guardrail checks, the milestone remains in progress. A comparison with Gemini 3.7 Flash may then be proposed using the same dataset; no silent model change is allowed.

## Implementation record

Implemented on 2026-09-01:

- Added explicit Markdown, text, and page-aware PDF loading; text normalization; SHA-256 identity; version tracking; local original-file persistence; and a durable JSON registry.
- Added real WordPiece-aware recursive chunking with a 200-token maximum, 30-token overlap where the final bound permits it, section metadata, and a hard final-size assertion.
- Added an application-owned MiniLM provider that delegates embedding generation to `@chroma-core/default-embed`, prepares the matching Hugging Face tokenizer explicitly, and supplies 384-dimensional precomputed vectors to ChromaDB.
- Added a Chroma repository with cosine collections, normalized similarity results, independent Local and Cloud collection names, and parameterized unique collections for live integration tests.
- Added the approved document, retrieval, and answer routes with bounded inputs, a bounded Gemini output budget, safe public document projections, structured Gemini output, conservative provider filters, deterministic obvious-injection fallback, untrusted-document checks, and server-side citation validation.
- Added Documents, Chat, and Retrieval Debugger pages plus shared navigation, target selection, browser-to-Express API handlers, provider/data-use warnings, loading and error states, citations, scores, timing, model, and usage visibility.
- Added nine synthetic SaaS support documents, including an inert embedded-instruction test fixture, and 15 fixed evaluation cases, seven of which are unsupported or adversarial.
- Added seed, evaluation, Local RAG integration, and Cloud RAG integration commands. Live integration tests create unique collections and clean them safely.
- Added the six approved runtime dependencies at their exact pinned versions and preserved ESM throughout both workspaces.

The implementation uses Gemini 3.5 Flash-Lite's current `thinkingLevel: "minimal"` configuration rather than the legacy numeric thinking-budget field. No larger-model fallback was added.

## Verification evidence

Baseline observed on 2026-09-01 and the post-completion hotfix reverified on 2026-09-02 with Node.js `24.20.0` and npm `11.19.0`:

| Check | Result |
| --- | --- |
| `npm ci` | Passed; 276 packages installed from the lockfile. Two transitive deprecation notices and npm install-script review notices were emitted. |
| `npm test` after the punctuation-loss hotfix | Passed: 37 tests; the two live RAG cases were skipped by default as designed. This includes a real `pdf-parse` extraction test, the guardrail regression cases, and lossless punctuation-heavy chunking checks. |
| `npm run build` after the clean install | Passed; `/`, `/documents`, `/chat`, and `/retrieval-debugger` were generated. |
| Fresh MiniLM first-run smoke test | Passed after the approved one-time Hugging Face download: 384 dimensions and vector norm `1`. |
| Real-tokenizer chunk smoke test | Passed: five chunks, largest measured chunk 198 WordPiece tokens against the 200-token bound. |
| Local Chroma heartbeat | Passed. |
| Local real RAG integration | Passed using a unique collection, real MiniLM precomputed vectors, ingestion, expected-source retrieval, and cleanup. |
| Chroma Cloud heartbeat | Passed without exposing credentials. |
| Chroma Cloud real RAG integration | Passed using the same local embedding path, a unique Cloud collection, expected-source retrieval, and cleanup. |
| Local baseline retrieval | 15 cases; Recall@1 `1.00`, Recall@3 `1.00`, MRR `1.00`, exact-identifier Recall@1 `1.00` across three identifier cases. Median latency `89.16 ms`; warm mean excluding the first request `88.91 ms`. |
| Cloud baseline retrieval | 15 cases; Recall@1 `1.00`, Recall@3 `1.00`, MRR `1.00`, exact-identifier Recall@1 `1.00`. Median latency `392.78 ms`; warm mean excluding the first request `390.38 ms`; first request `1935.63 ms`. |
| First live Gemini baseline | Found a real regression: expected-status accuracy was `0.7333` with citation validity `1.00`. Only 4/8 supported cases answered because the embedded-instruction detector treated a lower-ranked malicious fixture as poisoning the entire retrieved set and also misclassified benign API-key policy text. |
| Corrected live Gemini baseline | Passed all 15 cases: 8/8 supported cases `answered`; 7/7 unsupported or adversarial cases returned `insufficient_context`; citation validity `1.00`; expected-status accuracy `1.00`; 12 provider calls used 6,349 total tokens. Median provider latency was `1679.75 ms` and mean provider latency was `2273.29 ms`; three high-risk cases used deterministic fallback without a provider call. |
| Manual browser Local/Cloud flows | Passed. Documents listed all nine seeded documents on both targets. Retrieval Debugger ranked `payment-errors.md` first for `PAYMENT_4027` on both targets and exposed scores, timing, and embedding model. Chat returned a grounded cited answer on both targets and a Local weather question returned `insufficient_context` without sources. |
| Post-completion Markdown punctuation regression | Reproduced after uploading this milestone document: scoped package names and semantic versions were reduced to their final version digits before embedding. The sentence splitter was made lossless, regression tests were added, exactly 58 corrupted Local chunks were removed, and the document was re-ingested as 59 corrected chunks. The user confirmed that the repeated Chat question displayed all six exact package/version pairs. |
| `git diff --check` | Passed. |

The perfect retrieval scores are a result on a deliberately small, synthetic nine-document corpus. They establish a reproducible baseline; they do not demonstrate production retrieval quality or justify a permanent threshold.

All 12 documented gates passed. The first live answer evaluation exposed an over-broad content guardrail; the corrected implementation filters suspicious lower-ranked chunks from model context, refuses a suspicious top-ranked chunk deterministically, preserves legitimate security-policy content, and restricts citations to the safe retrieved subset. Milestone 1 is therefore **Complete**.

## Post-completion hotfix

On 2026-09-02, a manual upload of this milestone document exposed silent content loss in sentence splitting. Internal periods were excluded by the original regular expression unless they terminated a sentence, so values such as `` `@chroma-core/default-embed@0.1.9` `` reached Chroma as only `` `9` ``. Retrieval still selected the correct document and section, which initially made the malformed answer look like a generation problem.

The splitter now detects sentence-ending punctuation without discarding unmatched characters. Regression coverage proves normalized reconstruction and preservation of scoped packages, semantic versions, decimals, URLs, filenames, and Markdown inline code while retaining the token bound. The full deterministic suite increased from 35 to 37 passing tests, the frontend build and whitespace checks passed, and the affected Local document was re-ingested through the normal API. This corrective work does not change the approved chunk-size, overlap, embedding, storage, retrieval, or generation architecture.
