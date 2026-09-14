# Milestone 3 — Advanced Retrieval

## Status and approval boundary

- **Status:** In progress — approved implementation underway; completion evidence pending.
- **Consolidation and document creation approved:** 2026-09-13.
- **Implementation choices and scope approved:** 2026-09-13.
- **Started:** 2026-09-13.
- **Combines the former planned milestones:** Metadata Filtering, Hybrid Retrieval, and Reranking.
- **Depends on:** Completed Milestone 2 heading-aware `240/15` chunking and its Local/Cloud retrieval baseline.

The user approved combining the milestone outline, the implementation scope, and the local reranker model download. The decision record below resolves the pre-implementation questions. The model's production-default setting remains an evidence checkpoint, not a preselected outcome. Do not add a new npm dependency or alter existing Local/Cloud production collections merely to run experiments.

## Goal and reason

Make SupportLens retrieve the *right* knowledge more reliably when documents belong to different products or versions, when questions contain exact identifiers, and when the first retrieval ranking is imperfect. Compare each stage against the unchanged Milestone 2 vector-only baseline so improvements and costs can be explained in interviews.

This combines related retrieval work without dropping any capability: metadata filtering (PRD FR-7), hybrid keyword/vector retrieval (FR-8), and measured reranking (FR-9) must each have their own verification evidence.

## Concepts to learn and demonstrate

- Filtering the candidate corpus before ranking versus hiding unwanted results afterward.
- Semantic similarity versus exact-term matching, especially for codes and API fields.
- Candidate recall, rank fusion, and the difference between retrieving candidates and reranking them.
- Recall@k, MRR, exact-identifier behaviour, required-fact coverage, latency, and the cost of extra retrieval stages.
- Controlled comparisons on fixed cases, including a documented no-improvement result.

## Known starting point

- Ingestion stores `source`, `section`, `documentId`, checksum, numeric upload `version`, and page when available. The current `version` is an upload revision, **not** a product/document release label such as `v2`.
- The retrieval endpoint performs one Chroma vector query and returns ranked chunks. Chat uses that same retrieval path. Neither API currently accepts a metadata filter.
- The frontend has separate Chat, Documents, and Retrieval Debugger screens using the existing `apiHandlers` HTTP boundary.
- Local and Cloud targets have independent active Chroma collections. The M2 reindex path has candidate-collection verification and pointer activation; it must not be bypassed by a metadata migration.
- Existing synthetic cases and M2 experiment evidence provide regression coverage, but do not yet prove that filtering, keyword retrieval, or reranking helps.

## Approved implementation sequence

### A. Fixed retrieval cases and baseline

Define synthetic, version-controlled cases that expose wrong-product/version results, exact identifiers, paraphrases, similar documents, and ranking failures. Record the current vector-only results before changing retrieval. Keep corpus, questions, embedding model, chunking configuration, Local/Cloud target, and candidate depth controlled when comparing stages. Reuse these cases as the starting point for Milestone 4; its larger reviewed golden dataset is outside this milestone.

### B. Metadata filtering

Fields are optional `product`, `documentType`, and `documentVersion`, all distinct from the existing numeric upload revision. Capture explicit values at ingestion, persist them on document records and every new chunk, validate filter input at the Express boundary, and apply filters during retrieval so excluded chunks cannot reach Gemini. Keep unfiltered requests backward-compatible. Expose selected filters and returned metadata in Chat and Retrieval Debugger. Existing unlabeled documents remain available to unfiltered searches but do not match a requested label; no retroactive metadata edit or migration is included.

### C. Hybrid retrieval

Use Chroma's native document-text search as an exact-term/keyword candidate path over the full eligible target corpus—not merely the already-truncated vector top-k. Combine keyword and vector candidates with deterministic Reciprocal Rank Fusion (equal channel weights; record the fixed rank constant and candidate depths in experiment output). The same target and metadata filters apply to both paths. Preserve each stage's candidates and scores/ranks for the Retrieval Debugger. Chroma's text matching is case-sensitive and does not supply BM25 relevance scores; retain those limitations in the research record and test exact identifiers explicitly. Compare vector-only and hybrid results on the fixed cases.

### D. Reranking experiment

Rerank a bounded candidate pool with the approved free, local `Xenova/ms-marco-MiniLM-L-6-v2` cross-encoder through the already-installed Transformers.js runtime. Its model files may be downloaded and cached; no new npm dependency is approved. Compare vector-only, hybrid, and hybrid-plus-rerank against the same cases. Report quality and latency separately. Keep the production default unchanged until the evidence is reviewed; reranking may become default, stay opt-in, or be rejected. Failures must not silently replace a verified retrieval result.

### E. Final validation and documentation

Run deterministic tests, build, Local and Cloud retrieval checks, targeted Gemini/guardrail regression on synthetic data, and rendered browser checks for upload, Chat, and Retrieval Debugger. Record real results, failures, and decisions in a Milestone 3 research document if an experiment or architecture comparison is performed. Update this milestone, the master plan, and README only with verified outcomes.

## Decision record

The user approved the combined choices in conversation on 2026-09-13 after the trade-offs were explained in plain language. The original questions are retained here with their resolutions so implementation does not silently decide product behaviour.

### Product and data

1. Use optional explicit `product`, `documentType`, and `documentVersion` string labels; preserve the existing numeric upload `version` as a separate internal revision. Normalize and validate labels consistently rather than silently inferring them from content.
2. Collect labels on new uploads and in version-controlled synthetic fixture definitions. Post-upload editing is out of scope; do not guess labels from filenames or text.
3. Preserve existing unlabeled records and chunks. They remain visible without filters and are excluded when a requested field is absent. Re-uploading identical bytes remains a duplicate, not a metadata-edit mechanism; document this limitation rather than overwriting the active collection.
4. Return a clear empty result in the debugger and the established `insufficient_context` fallback in Chat; an empty filtered result must not call Gemini.

### Retrieval architecture

5. Filter values match exactly after consistent validation/normalization; multiple fields combine with AND. Missing fields do not match. No filter preserves today's search. Multi-value OR and arbitrary Chroma filter expressions are out of scope.
6. Use Chroma document-text search, avoiding a second index that must be kept in sync across ingestion and collection cutovers. Its case-sensitive substring behaviour is a known trade-off, not a claim of general BM25 search.
7. Preserve exact identifiers including punctuation/underscores as keyword terms; use bounded, deterministic term extraction and test mixed-case/wording limits. The vector channel remains available for paraphrases or text-search misses.
8. Deduplicate by chunk ID and use equal-weight Reciprocal Rank Fusion with deterministic ties. The exact rank constant and candidate depth are fixed and reported in the experiment; do not reinterpret vector similarity, keyword hits, and fusion rank as comparable raw scores.
9. Use a bounded local cross-encoder run via the existing Transformers.js package. The one-time model download is approved; a new package, hosted inference service, or unbounded request-time candidate scan is not.
10. Compare candidate quality, exact-ID behaviour, required-fact coverage, latency, and failures on fixed cases before any default switch. The production-setting decision is deliberately deferred to observed evidence and user review; no invented quality threshold is approved.

### Testing, safety, and operations

11. Extend the fixed M1/M2 synthetic cases with ambiguous same-topic, wrong-product/version, exact-code, paraphrase, unsupported, and adversarial cases; reserve some cases from tuning for final validation. Expected sources/facts must be written before accepting a comparison result.
12. Do not rewrite legacy data for this milestone. New labels are written on ingestion to registry and chunks within the existing target lock. Any reindex of newly labeled documents must copy approved registry labels and use the existing candidate-collection safety path. Local and Cloud remain isolated; experiments use uniquely named temporary collections and clean up only their own creations.
13. Bound term count, per-channel candidate count, model input size, and reranking work. Record measured first-use and warm latency; do not assume a no-cost model download. Do not add an unbounded local/Cloud corpus scan or new long-lived index.
14. Reject unknown filter keys, malformed values, and unsupported retrieval options at the API boundary with a 400 response. Show active filters and vector/keyword/fused/reranked stages in the debugger and keep Chat's selected filters visible. Filters do not grant authorization or tenant isolation.
15. Run deterministic and build checks, Local/Cloud retrieval integrations, targeted Gemini checks on synthetic/non-sensitive data, and a final rendered-browser check. If an external service or browser check is unavailable, leave the gate pending and ask the user for that specific check rather than declaring completion.

## Approved pass/fail gate

Milestone 3 can be marked **Complete** only when:

1. Every agreed filter field is persisted consistently, validated, and applied before answer generation on both Local and Cloud; unfiltered behaviour remains intact.
2. The keyword path searches the full eligible target corpus, respects the same filters, and does not leak chunks from another target or excluded label.
3. Vector-only, keyword, hybrid, and reranked candidates are distinguishable in the debugger; fusion and final context selection are deterministic and tested.
4. A fixed synthetic dataset records per-stage Recall@k, MRR, exact-identifier ranking, required-fact coverage where applicable, and latency. Rejected experiments remain in the research record.
5. Reranking is implemented and measured under agreed resource limits. Its production setting follows the documented evidence-based decision, including a no-default-change outcome if it does not help enough.
6. Existing M1/M2 retrieval, answer, citation, and guardrail regressions pass; filtered no-results and invalid-input paths are tested.
7. Deterministic tests, frontend build, Local and Cloud integration, targeted live Gemini on synthetic data, and rendered browser checks pass or any unavailable external check is explicitly left pending rather than called complete.
8. Migration/rollback verification, real commands and results, research findings, README usage, this milestone's evidence, and the master plan are synchronized.

## Out of scope for this milestone

- A production authorization or multi-tenant boundary; metadata filters are not access controls.
- Replacing ChromaDB, the MiniLM embedding baseline, Gemini answer model, or the approved M2 chunking strategy without separate evidence and approval.
- Milestone 4's comprehensive 40–50-case reviewed golden dataset, calibrated grounded-fallback threshold, claim-level citation work, and automated CI quality gate.
- New dependencies, an external search service, or a model download until explicitly selected and approved.

## Approved file-level implementation plan

- Extend `backend/src/services/ingestionService.js`, `backend/src/services/documentRegistry.js`, and `backend/scripts/reindex.js` only as needed to preserve explicit metadata on new documents and candidate rebuilds; do not migrate existing unlabeled collections.
- Extend `backend/src/routes/documentRoutes.js`, `backend/src/routes/ragRoutes.js`, `backend/src/services/retrievalService.js`, `backend/src/repositories/chromaRepository.js`, and `backend/src/app.js` for validated filters, full-corpus text candidates, fusion, bounded reranking, and stage-visible responses. Small dedicated validation/retrieval helper modules may be added under the existing `backend/src/validation/` and `backend/src/services/` directories, without a new architecture layer.
- Extend `frontend/src/apiHandlers/ragApi.js`, `frontend/src/app/documents/page.js`, `frontend/src/app/chat/page.js`, `frontend/src/app/retrieval-debugger/page.js`, and existing styles only as needed for upload labels, optional query filters, and readable stage outputs.
- Extend existing backend tests; add focused M3 test files, a version-controlled synthetic fixture/case set, and a root-accessible retrieval-experiment command. All new fixture and experiment files stay under existing `backend/fixtures/`, `backend/evals/`, and `backend/scripts/` directories; package scripts may be updated without adding dependencies.
- Create `docs/Research/Research_M3_Advanced_Retrieval.md` for actual retrieval comparisons and failures, then update this milestone, `docs/SupportLens_plan.md`, and `README.md` with verified evidence. No M4 document or application work is included.

Implementation proceeds in baseline/metadata, hybrid, and reranker stages, each with focused tests and an evidence checkpoint. This document records approval to implement M3; it does not preapprove a reranker default or claim the milestone gate has passed.

## Implementation record — 2026-09-13

- New uploads accept optional `product`, `documentType`, and `documentVersion` labels. They are validated at the Express boundary, stored on the document registry record and chunks, and copied into safe reindex candidates. Legacy unlabeled chunks remain unfiltered-searchable and do not match a requested label. The existing numeric upload revision is unchanged.
- Retrieval applies exact-label AND filters inside Chroma vector queries and keyword document-text searches. The default remains vector-only. Explicit `hybrid` mode uses bounded exact-term candidates and deterministic equal-weight RRF; explicit `reranked` mode scores a bounded fused pool with the approved local cross-encoder. Chat and the Retrieval Debugger expose the chosen filters and stage evidence. An empty filtered context returns `insufficient_context` without a Gemini call.
- The version-controlled M3 synthetic fixture/case set and `npm run experiment:retrieval` compare vector-only, keyword-only, hybrid, and reranked retrieval in an isolated Local collection. The runner records configuration, per-case ranks, candidate-stage evidence, filter audits, first-use/warm latency, failures, and exact collection cleanup. It uses the production keyword term extractor and the approved heading-aware `240/15` chunker. No new npm dependency was added.

Files affected: `backend/src/validation/metadata.js`, `backend/src/services/{ingestionService,retrievalService,rerankerService}.js`, `backend/src/repositories/chromaRepository.js`, `backend/src/routes/{documentRoutes,ragRoutes}.js`, `backend/src/app.js`, `backend/scripts/{reindex,runRetrievalExperiments}.js`, `backend/src/evals/retrievalExperimentMetrics.js`, `backend/fixtures/retrieval/m3-advanced-retrieval.json`, root/backend `package.json`, existing and focused backend tests, and the existing frontend `apiHandlers`, Documents, Chat, Retrieval Debugger, and stylesheet files. The approved PRD/master-plan/research/README documentation was updated or is being synchronized as part of this stage.

## Evidence checkpoint and production-setting recommendation

The completed Local comparison is in [Research M3](../Research/Research_M3_Advanced_Retrieval.md), with raw output under ignored `backend/.local/evals/`. On five answerable source-ranking cases, vector-only and reranked retrieval both achieved Recall@1 `0.60`, Recall@3 `1.00`, and MRR `0.80`; hybrid lowered Recall@3 to `0.80` and MRR to `0.75`. Reranking improved exact-ID Recall@1 from `0.00` to `0.50`, but moved one paraphrase down and increased warm median retrieval latency from `68.90` to `125.73` ms. All filtered cases respected labels; no-match returned zero chunks. Required-fact coverage@4 was `1.00` for every stage on this deliberately small synthetic set.

Recommendation for user review: **keep vector-only as the production default and hybrid/reranked modes opt-in**. This is not a claim that reranking is universally worse, and no default setting was changed. The user-facing decision checkpoint remains open until the user accepts or revises this recommendation.

Verified checks so far: after the final validation correction, `npm test` passed 132 deterministic cases with four expected opt-in live skips; `npm run build` and `git diff --check` passed. The focused validation/reindex tests passed 28 cases. Local and Cloud heartbeat checks passed; expanded Local and Cloud real RAG integration each passed two cases with two opposite-target/opt-in skips; and the opt-in synthetic Gemini answer/empty-context check passed. An initial expanded Local integration failure was traced to an invalid multi-field `where` object in the direct *test assertion*, corrected to Chroma's `$and` form, then rerun successfully. The Browser Debugger rendered filtered-empty and reranked stage views, and Local/Cloud Chat rendered filtered-empty fallbacks with Gemini not called. The browser upload control rendered but its file chooser was denied local-file access, so a completed rendered labeled upload has not been verified.

Follow-up correction on 2026-09-14: explicitly supplied `null`, empty, or whitespace-only metadata filters now return HTTP 400, while omitted fields remain optional. API regressions cover all three fields; the reindex test verifies that every rebuilt chunk retains all three labels and numeric upload version. Chat and Retrieval Debugger previously sent empty strings for untouched optional inputs, producing a 400 after this stricter validation. Their shared frontend API handler now omits blank values and trims nonblank ones. A direct request-normalization check, frontend production build, and `git diff --check` passed. A rendered browser retry with all filters blank has not yet been reported.

## Remaining gate before completion

1. Obtain the user's decision on the evidence-based production setting. No default promotion is implied by implementing opt-in modes.
2. Complete one rendered Documents upload with explicit labels and verify the resulting ready record; the browser-control session could not attach a local file. API ingestion and real Local/Cloud retrieval tests already passed but do not satisfy this visual check.
3. Confirm in the rendered Chat or Retrieval Debugger that a question with all three optional filters blank succeeds after the frontend correction. Automated request normalization and build passed, but this browser retry has not been reported.
4. After those user checks and the default decision, synchronize this milestone and master-plan status. Until then, **In progress** is accurate.
