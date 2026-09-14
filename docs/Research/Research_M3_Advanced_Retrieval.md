# Research M3 — Advanced Retrieval

## Status

- **Status:** In progress — experiment design approved; results pending.
- **Started:** 2026-09-13.
- **Related milestone:** `docs/Milestones/Milestone_3_Advanced_Retrieval.md`.

## Purpose

Record controlled evidence for three retrieval changes: metadata filtering, hybrid vector/keyword retrieval, and local cross-encoder reranking. The research must preserve failures and neutral outcomes, keep answer generation separate from retrieval measurement, and avoid presenting synthetic-corpus results as universal production claims.

## Baseline and controls

- Production baseline: Milestone 2 heading-aware `240/15` chunks, application-generated `Xenova/all-MiniLM-L6-v2` embeddings, cosine-compatible Chroma collections, and vector-only top-four retrieval.
- Use the same version-controlled synthetic documents, questions, expected sources/facts, metadata filters, embeddings, and candidate depths when comparing applicable stages.
- Write expected sources, filters, exact-identifier flags, and required facts before accepting experiment results.
- Record vector-only, keyword-only, fused, and reranked results separately.
- Record first-use and warm latency separately where model loading affects timing.
- Do not allow sequential-run latency to select a quality winner.
- Use isolated experiment collections and delete only collections created by the experiment run.
- Run Gemini only after retrieval behaviour is selected, using synthetic/non-sensitive data.

## Approved designs and expected limitations

### Metadata filtering

New documents may carry optional `product`, `documentType`, and `documentVersion` string labels. Filters use exact equality and AND across supplied fields; a missing field does not match. Unfiltered retrieval remains backward-compatible. The existing numeric `version` remains an upload revision.

Chroma applies metadata filters through the `where` query argument, so filtering can constrain the searchable records before vector top-k selection rather than removing unwanted results afterward. Reference: [Chroma metadata filtering](https://docs.trychroma.com/docs/querying-collections/metadata-filtering).

### Keyword candidate retrieval and fusion

The approved keyword channel uses Chroma document-text search, avoiding a second index that would have to stay synchronized with ingestion and active-collection cutovers. Chroma documents that its full-text `$contains` operation is case-sensitive. This channel therefore targets exact terms and identifiers; it is not described as BM25 or as a general language-ranking system. Reference: [Chroma full-text search](https://docs.trychroma.com/docs/querying-collections/full-text-search?lang=typescript).

Vector and keyword ranks will be deduplicated by chunk ID and combined using deterministic equal-weight Reciprocal Rank Fusion. The runner must record its rank constant, per-channel candidate depths, tie-breaking rule, and returned ranks. Vector similarity, keyword membership, and fusion rank are different signals and must not be displayed as one raw score.

### Cross-encoder reranking

The approved candidate is `Xenova/ms-marco-MiniLM-L-6-v2`, evaluated locally using the already-installed `@huggingface/transformers` runtime. It jointly scores question/passage pairs rather than generating independent embeddings. Its model files require a one-time local download and add inference latency. Reference: [Transformers.js cross-encoder model usage](https://huggingface.co/Xenova/ms-marco-MiniLM-L-6-v2/blob/main/README.md).

Reranking is not approved as the production default in advance. The experiment must measure a bounded candidate pool and can conclude that reranking remains opt-in or is rejected.

## Questions and hypotheses

1. Do server-side metadata filters exclude same-topic chunks from the wrong product or document version without changing unfiltered results?
2. Does the keyword channel improve exact-code and field-name ranking where vector-only retrieval misses or ranks them poorly?
3. Does equal-weight rank fusion preserve semantic paraphrase performance while improving exact-identifier cases?
4. Does cross-encoder reranking improve Recall@1 or MRR after hybrid candidate generation?
5. Does any retrieval stage reduce top-four required-fact coverage or make unsupported/adversarial behaviour worse?
6. Are first-use and warm latency, memory use, failure handling, and Local/Cloud parity acceptable for this learning application?

Hypotheses, not results:

- Metadata filtering should improve precision for ambiguous cross-product/version questions by reducing the eligible corpus.
- Chroma text matching should help exact identifiers that appear literally, but case sensitivity may miss differently cased queries.
- Hybrid fusion should be more robust than either vector or exact-substring retrieval alone.
- Cross-encoder reranking may improve first-result rank at a material latency cost; the small synthetic corpus may be too easy to show a gain.

## Metrics

- Recall@1, Recall@3, Recall@4, and Recall@5 where enough candidates exist.
- Mean Reciprocal Rank.
- Exact-identifier Recall@1 and per-case rank.
- Required-fact coverage in the final top four where cases declare required facts.
- Filter correctness: all returned chunks satisfy every requested label, and excluded/no-match cases return no leaked chunk.
- Per-stage first-use/warm latency and bounded candidate counts.
- Later targeted answer checks: expected status, citation validity, no Gemini call on empty filtered context, and existing adversarial/guardrail regressions.

## Pre-implementation baseline verification

On 2026-09-13, before application-code changes:

- `npm test` passed 110 deterministic tests with two intentional opt-in live RAG skips when rerun outside the listener-restricted sandbox. The first sandboxed run produced `listen EPERM` in Supertest and was treated as an environment failure, not a product result.
- `npm run build` passed and prerendered `/`, `/chat`, `/documents`, and `/retrieval-debugger`.
- Local Chroma persisted data existed under `.local/chroma`; the executable was not on the shell PATH at that point. The project-managed `node_modules/.bin/chroma` command was found later and the existing Local service was reachable for the integration and experiment runs below.

## Controlled Local comparison — 2026-09-13

`npm run experiment:retrieval` completed after the keyword-only runner was corrected to use the exact production term extractor. The retained machine-readable output is `backend/.local/evals/m3-retrieval-accb694e9429.json` (ignored by Git); run ID `accb694e9429`. The runner uses the version-controlled `backend/fixtures/retrieval/m3-advanced-retrieval.json`: nine synthetic documents and eight predetermined cases, five with an expected source, two exact-identifier cases, three filtered cases, and unsupported/adversarial probes. Every document is passed through the approved heading-aware `240/15` chunker and the same `Xenova/all-MiniLM-L6-v2` embedding provider. It creates and removes only a uniquely named Local Chroma collection; the result file reports `cleanup.deleted: true` and no stage failures.

For the five answerable source-ranking cases, with a final depth of five:

| Stage | Recall@1 | Recall@3 | Recall@4 | Recall@5 | MRR | Exact-ID Recall@1 | Required-fact coverage@4 | Median warm retrieval ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Vector only | 0.60 | 1.00 | 1.00 | 1.00 | 0.80 | 0.00 | 1.00 | 68.90 |
| Keyword only | 0.60 | 0.80 | 0.80 | 1.00 | 0.74 | 0.00 | 1.00 | 12.98 |
| Hybrid RRF | 0.60 | 0.80 | 1.00 | 1.00 | 0.75 | 0.00 | 1.00 | 91.55 |
| Hybrid + rerank | 0.60 | 1.00 | 1.00 | 1.00 | 0.80 | 0.50 | 1.00 | 125.73 |

The vector stage requests five candidates. Hybrid requests up to 25 vector candidates and 20 keyword candidates, deduplicates by chunk ID, and uses equal-weight RRF with `k=60`. Reranking scores up to 20 fused candidates; the final five are selected for the answer context. The runner performs one untimed warmup plus three timed runs per case. Its reranker prepare time was 103.77 ms in the corrected run; warm full-retrieval median was 125.73 ms, not isolated inference time. These sequential-run latencies are descriptive and must not select a winner.

All three filtered cases returned only matching metadata at every stage, and the `product=shipping` no-match case returned zero candidates. The saved rows include each returned ID, source, metadata, rank and stage-candidate evidence. The keyword-only stage returned no candidate for the unrelated payroll query, while vector, hybrid, and reranked retrieval still returned five candidates. Retrieval alone therefore cannot establish safe unsupported-answer behavior. The adversarial query retrieved the inert security fixture; the answer guardrail must still refuse to follow its instructions.

The result is deliberately mixed, not a blanket improvement: hybrid moved the similar-code ranking case's expected source from vector rank 2 to rank 4, lowering MRR. Reranking moved the direct `PAYMENT_4027` definition from rank 2 to rank 1, but moved the authentication paraphrase from rank 1 to rank 2 and left overall Recall@1/MRR unchanged. The first pilot (`m3-retrieval-c8e7116f86f8.json`) used a duplicated keyword term extractor with two additional stopwords; it was rejected as non-comparable and rerun with the production extractor. Its cleanup also completed. Because this small synthetic corpus does not show a clear overall win and reranking is slower, the evidence supports retaining vector-only as the production default and keeping hybrid/reranked modes opt-in, subject to the user decision checkpoint in the milestone. No default switch has been made.

## Verification and remaining limits

- Final `npm test` passed 127 deterministic tests with four intentional opt-in live skips; `npm run build` passed and prerendered all application routes. `git diff --check` passed.
- `npm run test:integration:local` and `npm run test:integration:cloud` both passed. The expanded `npm run test:integration:rag:local` and `npm run test:integration:rag:cloud` each passed two live cases (two other opt-in cases skipped), including real metadata-constrained vector/hybrid results, empty no-match results, and exact-ID keyword candidates in uniquely named temporary collections.
- `RUN_LIVE_GEMINI=true npm run test --workspace backend -- tests/chroma.rag.integration.test.js` passed the synthetic grounded answer and empty-context fallback check. The test's full suite output was 128 passed, three opt-in skips. This checks the configured Gemini path but is not a claim that every unsupported/adversarial M3 case was model-graded.
- The rendered Brave session showed Documents' label fields, a Local filtered-empty Debugger result, a Local reranked Debugger view with vector/keyword/fused/reranked candidate lists, and Local and Cloud Chat filtered-empty `insufficient_context` responses with “Gemini: not called.” The browser-control session was denied permission to attach a local file, so rendered upload with labels remains unverified. The API-level labeled ingestion and live retrieval tests are separate evidence, not a substitute for that visual gate.
- A first expanded Local integration run failed because the *test's direct repository call* passed two raw metadata keys instead of Chroma's required `$and` shape. The test was corrected; subsequent Local and Cloud runs passed. This did not change the application path, which already builds `$and` for multi-field filters.
- The comparison corpus is tiny, synthetic, and mostly one chunk per document. Its perfect required-fact coverage is not evidence that fact retrieval is solved on realistic documents. Cloud parity is checked by integration, not by repeating the full quality/latency matrix on Cloud. No production authorization boundary is provided by these labels.
