# Research M1 — Basic RAG Baseline

## Status

- **Status:** Complete
- **Started:** 2026-09-01
- **Completed:** 2026-09-01
- **Evidence:** Runtime, retrieval, answer, guardrail, usage, integration, and rendered-browser results recorded below
- **Related milestone:** `docs/Milestones/Milestone_1_Basic_Vector_RAG.md`

## Purpose

Record the real experiments and evidence produced while establishing SupportLens's first vector-RAG baseline. This document separates measured results from architectural expectations so later milestones can compare changes without rewriting history.

## Approved baseline under test

- Embedding model: local `all-MiniLM-L6-v2`.
- Embedding ownership: Express generates embeddings explicitly and supplies vectors to ChromaDB.
- Chunking: recursive, boundary-aware, maximum 200 WordPiece tokens, 30-token overlap.
- Vector store: independent Local and Chroma Cloud collections using the same cosine-compatible schema.
- Answer model: `gemini-3.5-flash-lite` through the Google GenAI SDK.
- Generation: single-turn, non-streaming, structured output, no external tools or search.
- Corpus: version-controlled synthetic SaaS support documents.
- Evaluation: approximately 12–15 fixed cases, including adversarial and unsupported questions.

## Questions to answer with evidence

1. Does the selected MiniLM runtime work reliably under Node.js 24 on the development Mac?
2. Do all generated chunks remain within the model's verified token limit?
3. Does explicit embedding generation produce vectors accepted consistently by both Chroma targets?
4. What retrieval scores and rankings does the fixed corpus produce for semantic and exact-identifier questions?
5. What are Recall@1, Recall@3, and MRR for the initial case set?
6. Does Gemini 3.5 Flash-Lite reliably return the required structured answer schema?
7. Are returned citation identifiers always drawn from retrieved chunks?
8. Does the application refuse unsupported and adversarial questions without using world knowledge?
9. What latency is attributable to loading, chunking, embedding, storage, retrieval, and generation?
10. What Gemini token usage and quota failures are observed?
11. Do Local and Cloud produce materially different retrieval behaviour for the same vectors and corpus?

## Hypotheses

These are expectations to test, not results:

- A 200-token limit should avoid MiniLM's documented 256-WordPiece truncation boundary while retaining useful paragraph context.
- Explicit precomputed embeddings should make Local and Cloud retrieval directly comparable.
- Flash-Lite should be sufficient for short, context-constrained support answers, but citation adherence and abstention must be measured.
- Exact identifiers such as `PAYMENT_4027` may expose weaknesses in vector-only retrieval and motivate the later hybrid-search milestone.
- Prompt and citation validation should reduce out-of-scope answers but will not provide an absolute security guarantee.

## Experiment controls

Keep these fixed when measuring the Milestone 1 baseline:

- Corpus contents and versions.
- Normalization rules.
- Chunk size and overlap.
- Embedding model and configuration.
- Collection distance function.
- Retrieval `topK`.
- Question wording.
- Gemini model and generation configuration.

Change only one controlled variable during a comparison and record the reason.

## Metrics

### Retrieval

- Recall@1.
- Recall@3.
- Mean Reciprocal Rank.
- Exact-identifier expected-source rank.
- Retrieval latency.

### Answer and citation

- Valid structured response rate.
- Correct `answered` versus `insufficient_context` status.
- Citation identifiers contained in the retrieved set.
- Unsupported claim or world-knowledge leakage observed by the fixed checks.
- Generation latency and reported provider usage.

### Operations

- Initial MiniLM model-download and load behaviour.
- Subsequent embedding latency.
- Ingestion duration and chunk count per document.
- Local versus Cloud storage and retrieval duration.
- Gemini rate-limit, safety-block, timeout, and malformed-response behaviour.

## Planned experiments

### Experiment 1: MiniLM runtime and chunk limit

- Tokenize representative Markdown, text, and PDF passages.
- Verify that every stored chunk is at or below 200 WordPiece tokens.
- Verify deterministic overlap and source metadata.
- Record model download, load, and embedding behaviour.

### Experiment 2: Local Chroma baseline

- Seed the approved corpus into a fresh, uniquely scoped Local collection.
- Run all supported retrieval cases.
- Record ranks, scores, metrics, and timing.

### Experiment 3: Chroma Cloud parity

- Seed the same chunks and embeddings into a fresh, uniquely scoped Cloud collection.
- Run the same retrieval cases.
- Compare ranks and scores without changing another variable.

### Experiment 4: Flash-Lite grounded answers

- Generate answers for supported and unsupported questions using retrieved context.
- Record structured-output validity, citations, status, latency, and usage.
- Do not send confidential data through the free tier.

### Experiment 5: Guardrail cases

- Attempt off-topic general-knowledge requests.
- Attempt direct prompt overrides.
- Attempt instructions embedded inside retrieved documents.
- Attempt system-prompt and secret extraction.
- Attempt fabricated citation requests.
- Record every failure rather than changing the expected result after execution.

## Model escalation rule

Gemini 3.7 Flash is not an automatic fallback. If Flash-Lite fails a documented quality or guardrail check, run the same prompt, retrieved context, and expected outcome against the alternative only after approval. Record quality, latency, and usage differences before proposing a model change.

## Results

### Runtime, chunking, and embedding

- A clean `npm ci` completed under Node.js `24.20.0` and npm `11.19.0`.
- The fresh-install MiniLM path performed its expected one-time network download and then produced a 384-dimensional normalized vector with measured norm `1`.
- The matching tokenizer counted `PAYMENT_4027 happens after upgrading` as seven WordPiece tokens.
- A real-tokenizer stress passage produced five chunks; the largest was 198 tokens against the configured 200-token maximum.
- The synthetic corpus contains nine documents and produced 13 chunks on each target.

### Retrieval baseline

The fixed dataset contains 15 cases: eight supported/paraphrase retrieval cases and seven unsupported or adversarial cases. The retrieval metrics below are calculated over the eight cases with an expected support source. Exact-identifier Recall@1 covers `PAYMENT_4027`, `ERR_AUTH_1003`, and `Retry-After`.

| Target | Recall@1 | Recall@3 | MRR | Exact-identifier Recall@1 | Median latency | Warm mean latency | First request |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Local | 1.00 | 1.00 | 1.00 | 1.00 | 89.16 ms | 88.91 ms | 183.14 ms |
| Chroma Cloud | 1.00 | 1.00 | 1.00 | 1.00 | 392.78 ms | 390.38 ms | 1935.63 ms |

The warm mean excludes the first request to expose the observed cold-start effect. Cloud and Local returned the same expected source ranks for all eight measured support cases. The result is encouraging for pipeline parity, but the corpus is too small and direct to support a broader quality claim.

Vector search still returned nearest chunks for unsupported questions such as current weather and cryptocurrency price. No permanent similarity threshold was introduced. The live answer-layer evaluation correctly abstained on those cases.

### Answer and guardrail baseline

The first live run found a guardrail regression rather than passing it over. Expected-status accuracy was `0.7333`: only four of eight supported cases answered, while all citations remained valid. The embedded-instruction detector scanned the entire retrieved set as one all-or-nothing decision. A malicious lower-ranked fixture therefore caused legitimate top-ranked context to be rejected, and benign authentication guidance about never revealing an API key matched an over-broad phrase detector.

The correction made the decision rank-aware and narrowed the suspicious-instruction patterns. A suspicious top-ranked chunk now causes a deterministic fallback without Gemini; suspicious lower-ranked chunks are excluded from the prompt; legitimate security-policy content remains usable; and citation validation uses only the safe retrieved subset. Four focused regression tests cover those behaviours.

The corrected live Local evaluation passed all 15 fixed cases:

- 8/8 supported or paraphrase cases returned `answered`.
- 7/7 unsupported or adversarial cases returned `insufficient_context`.
- Expected-status accuracy: `1.00`.
- Citation validity: `1.00`.
- Provider calls: 12; three high-risk cases used deterministic fallback.
- Reported provider usage: 6,349 total tokens; mean `529.08` and median `573.5` tokens per provider call.
- Provider latency: mean `2273.29 ms`, median `1679.75 ms`, observed range `913.92–6656.08 ms`.
- Retrieval during this live run remained perfect on the eight supported cases; mean latency was `96.41 ms` and median latency was `96.17 ms` across all 15 queries.

These fixed status and citation checks do not claim semantic answer perfection. They demonstrate that Flash-Lite satisfied the approved Milestone 1 schema, grounding, citation, and abstention gate on the synthetic baseline.

### Post-completion punctuation-loss regression

On 2026-09-02, the user uploaded `Milestone_1_Basic_Vector_RAG.md` and asked for its approved dependencies. Retrieval selected the correct source and `Approved dependencies` section, but the answer contained only `9`, `1`, `0`, `0`, `5`, and `4` instead of the package names and full semantic versions.

A direct ingestion diagnostic proved that corruption occurred before embedding and generation. The sentence-matching expression excluded internal periods and silently resumed after them, reducing values such as `` `@chroma-core/default-embed@0.1.9` `` to their final suffix. This failure class also threatened decimals, URLs, filenames, identifiers, and Markdown inline code.

The correction replaced the lossy matcher with sentence-boundary scanning that preserves all characters. New tests cover the exact six approved dependencies, normalized lossless reconstruction, decimals, URLs, filenames, scoped packages, inline code, ordinary sentence boundaries, and the existing token bound. The affected Local record was repaired narrowly: 58 corrupted chunks for that document were removed, and normal API ingestion produced 59 corrected chunks containing all six exact package/version pairs. The user confirmed that the repeated Chat question displayed all six dependencies.

A Local retrieval diagnostic also showed why output inspection alone is insufficient: the chunk containing the complete six-item list appeared at rank 5 for the original wording while the current default retrieval depth is 4. The successful UI text should therefore not be treated as claim-level grounding proof. This question becomes a required harder case for Milestone 2, where chunk structure and retrieval completeness can be measured without silently raising `topK`.

### Software and integration verification

- Deterministic suite after the punctuation-loss hotfix: 37 passed; two opt-in live cases skipped by default. The loader coverage includes the real `pdf-parse` path with a self-contained valid PDF and page-aware assertions.
- Frontend production build: passed for the status, Documents, Chat, and Retrieval Debugger routes.
- Real Local Chroma heartbeat and unique-collection RAG integration: passed.
- Real Chroma Cloud heartbeat and unique-collection RAG integration: passed.
- Rendered Documents, Retrieval Debugger, and Chat flows passed on Local and Chroma Cloud. Both targets listed nine documents and ranked `payment-errors.md` first for `PAYMENT_4027`; both produced a grounded cited answer. A Local current-weather question returned `insufficient_context` without sources.
- Repository whitespace validation: `git diff --check` passed.

## Failures and deviations

- The first independent test invocation was denied by the execution sandbox when Supertest attempted to bind a temporary loopback listener. Rerunning the unchanged suite with local-listener permission passed; this was an environment restriction, not an application failure.
- After `npm ci`, the first MiniLM smoke test could not resolve Hugging Face inside the restricted network sandbox. The same fresh-download command passed with the approved network permission and produced the expected normalized vector.
- The initial implementation manually pooled Hugging Face feature-extraction output and did not correctly read Tensor-shaped tokenizer IDs. Review replaced it with Chroma's approved default-embedding function, added Tensor/BigInt token handling, and introduced real-shape regression tests.
- The initial overlap path could exceed the final token bound. Review added overlap reduction, oversized-word handling, and a final invariant check.
- The initial evaluation draft conflated generation time with retrieval time and omitted Recall@1, Recall@3, MRR, answer-status checks, and one exact-identifier label. These defects were corrected before the recorded baseline.
- The first seed dataset temporarily had 16 cases. A redundant user-question-only injection case was removed after adding the stronger embedded-document case, leaving the approved 15.
- Workspace commands store uploads and the registry under `backend/.local/`; the root-only ignore rule initially missed that directory. The ignore pattern now covers `.local/` at any workspace depth. Existing synthetic seeded data was preserved for manual verification.
- `npm ci` reported deprecation notices for two transitive packages and asked for review of five dependency install scripts. The install, tests, build, fresh model download, and real integrations still passed; no unapproved version changes were made in response.
- The first live Gemini run produced only four of eight expected supported answers. The over-broad embedded-instruction handling was corrected and protected with four regression tests; rerunning the unchanged 15 cases produced 100% expected statuses and valid citations.
- A post-completion manual question revealed that the original sentence matcher silently discarded text around internal periods. The repaired splitter and lossless reconstruction tests preserve punctuation-heavy content; targeted re-ingestion corrected the affected Local document without resetting unrelated data.

## Current interpretation

- The explicit MiniLM → precomputed vector → Chroma path works against both storage targets.
- The large first Cloud latency and roughly four-times-higher warm Cloud latency are useful operational baseline evidence, not a reason to change architecture in this milestone.
- Perfect retrieval on nine compact synthetic documents is expected to be easier than a production knowledge base. Milestone 2 should retain these cases while adding harder boundary and distractor cases before comparing chunk parameters.
- Gemini 3.5 Flash-Lite satisfied the approved Milestone 1 live answer and guardrail baseline. Its result remains specific to the small synthetic corpus and fixed cases; later milestones should add harder examples before considering a model comparison.

## Sources verified for the implementation

- [Gemini 3.5 Flash-Lite model capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Gemini thinking configuration](https://ai.google.dev/gemini-api/docs/generate-content/thinking)
- [Gemini safety settings](https://ai.google.dev/gemini-api/docs/safety-settings)
- [Gemini API errors and quotas](https://ai.google.dev/gemini-api/docs/api-errors)
- [Chroma embedding functions](https://docs.trychroma.com/docs/embeddings/embedding-functions)
- [all-MiniLM-L6-v2 model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

## Evidence boundary

The approved architecture and cited provider capabilities are not benchmark results. This document must contain only commands actually run, outputs actually observed, and decisions made from that evidence.
