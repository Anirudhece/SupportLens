# Milestone 2 — Chunking Experiments

## Status

- **Status:** Complete
- **Approved:** 2026-09-03
- **Started:** 2026-09-03
- **Completed:** 2026-09-05
- **Corrective review completed:** 2026-09-06
- **Related research:** `docs/Research/Research_M2_Chunking_Strategy_Comparison.md`

## Goal

Determine whether SupportLens should retain or change its Milestone 1 recursive chunking baseline by comparing controlled chunk-size, overlap, and heading-aware packing variants against a fixed retrieval dataset.

The milestone must produce reproducible evidence. It is successful even if the evidence supports keeping the existing strategy.

## Why this milestone exists

Milestone 1 established a safe baseline: recursive boundary-aware splitting, a maximum of 200 `all-MiniLM-L6-v2` WordPiece tokens, and 30 tokens of overlap. That baseline is deliberately conservative rather than proven optimal.

The post-completion dependency-list regression also showed that expected-source rank alone is insufficient. The correct document can be retrieved while the top four chunks still omit facts required for a complete answer. Milestone 2 therefore measures both source retrieval and required-fact coverage.

## Concepts being learned

- Recursive boundary-aware chunking.
- The difference between chunk size, overlap, and semantic packing.
- Controlled experiments that change one variable at a time.
- Retrieval metrics versus answer-quality checks.
- Source-level recall versus fact-level context coverage.
- Latency, chunk-count, and quality trade-offs.
- Evidence-based configuration selection and regression protection.

## Approved decisions

### Existing production baseline

The current strategy remains the control:

```text
Paragraph
   ↓ if too large
Sentence
   ↓ if too large
Word
   ↓ if too large
Character
```

- Maximum chunk size: 200 WordPiece tokens.
- Overlap: 30 tokens.
- Embedding model: `Xenova/all-MiniLM-L6-v2`.
- Retrieval depth: `topK = 4` for the production decision.
- The implementation is custom and does not introduce LangChain or LlamaIndex.

### Experiment order

1. Reproduce the current `200/30` recursive baseline.
2. Compare recursive chunk sizes `100`, `150`, `200`, and `240` with overlap fixed at `30`.
3. Select the strongest size using retrieval and fact-coverage evidence.
4. Compare overlap values `0`, `15`, `30`, and `45` at that selected size.
5. Compare the strongest recursive configuration with heading-aware packing using the same size and overlap.

The runner must change one controlled variable at a time and identify every configuration by a stable name.

### Heading-aware packing

The heading-aware variant may combine small paragraphs, lists, and explanatory text belonging to the same heading until the token limit is reached. It must not carry overlap across different headings. It must remain lossless after normalization and must preserve the same source and section metadata as the baseline.

### Evaluation data

- Retain the 15 Milestone 1 cases as regression coverage.
- Add approximately 10 chunk-sensitive retrieval cases backed by two or three longer synthetic support documents.
- Cover complete lists, facts near chunk boundaries, split explanations, similar headings, exact identifiers, distractors, and questions requiring two nearby facts.
- Include the approved-dependencies question as a synthetic fact-coverage regression without depending on a private or manually uploaded document.
- Use only version-controlled synthetic data for automated Gemini checks.

### Metrics

Record the following for every applicable configuration:

- Recall@1, Recall@3, Recall@4, and Recall@5.
- Mean Reciprocal Rank.
- Exact-identifier recall.
- Required-fact coverage within the top four retrieved chunks.
- Total chunk count and average chunk token count.
- Ingestion and retrieval latency.
- Per-case expected-source rank and top-four fact coverage.

Expected-source metrics are calculated only for cases with an expected source. Required-fact coverage is calculated only for cases that declare required facts.

### Runtime and storage controls

- Run the full comparison matrix against Local ChromaDB.
- Use a uniquely named, temporary collection for each experiment configuration.
- Do not modify or delete the normal Milestone 1 Local or Cloud collections.
- Delete only the experiment collections created by the runner after results are captured.
- Run the selected configuration once against Chroma Cloud after the user approves the evidence-based selection.
- Use one warm-up retrieval followed by three timed retrieval runs per configuration.

### Gemini use

Retrieval comparison comes first. Gemini is not called for every configuration because provider variability and quota consumption would obscure the chunking comparison.

After the user approves a selected configuration, run the fixed supported, unsupported, adversarial, citation, and status checks once using synthetic data. No model change is included in this milestone.

### Configuration decision

Do not invent a composite score or arbitrary pass threshold before observing the results. The preferred configuration must:

- Preserve the critical Milestone 1 retrieval and guardrail behaviour.
- Improve or preserve hard-case expected-source rank and top-four required-fact coverage.
- Preserve normalized document content without silent loss.
- Keep every chunk within the verified token bound.
- Have acceptable, documented chunk-count and latency trade-offs.

If no candidate provides a meaningful improvement, retain `200/30` and document that result.

## Implementation scope

### Chunking implementation

- Keep the existing recursive behaviour as the default.
- Make the strategy, maximum token count, and overlap explicit inputs usable by the experiment runner.
- Add heading-aware packing without changing the production default before the decision checkpoint.
- Enforce lossless normalized reconstruction, section isolation, deterministic output, and final token bounds with automated tests.

### Experiment runner

- Seed a fresh experiment collection for each configuration using the approved synthetic corpus.
- Embed the corpus and fixed questions with the existing local MiniLM provider.
- Retrieve enough candidates to calculate metrics through Recall@5 while separately evaluating the production top-four context.
- Print a human-readable comparison table and a machine-readable JSON result.
- Clean up only collections created by the current run, including after a handled failure.
- Support one root command for the Local experiment matrix.

### Planned files

| File | Planned change |
| --- | --- |
| `backend/src/chunking/chunkDocument.js` | Expose deterministic baseline and heading-aware strategy behaviour while preserving the current default. |
| `backend/scripts/runChunkingExperiments.js` | Add the reproducible Local experiment runner and metrics calculation. |
| `backend/evals/m2-chunking-cases.json` | Add the fixed chunk-sensitive case definitions and required facts. |
| `backend/fixtures/chunking/` | Add the longer synthetic support documents used only by M2 experiments. |
| `backend/tests/chunking.test.js` | Extend token-bound, reconstruction, overlap, and heading-boundary coverage. |
| `backend/tests/chunkingExperiments.test.js` | Verify metrics and experiment-runner invariants without requiring live ChromaDB. |
| `backend/package.json` | Add the workspace experiment command. |
| `package.json` | Add the root experiment command. |
| `docs/Research/Research_M2_Chunking_Strategy_Comparison.md` | Record actual configurations, outputs, failures, comparisons, and the recommendation. |
| `docs/Milestones/Milestone_2_Chunking_Experiments.md` | Track implementation, verification evidence, the decision checkpoint, and completion gate. |
| `docs/SupportLens_plan.md` | Keep the milestone status and measurable gate synchronized. |
| `README.md` | Add the verified experiment command and selected production configuration only after validation. |

Exact fixture filenames and internal helper boundaries may be chosen during implementation, but no additional runtime dependency or architecture layer is approved.

## Implementation phases

### Phase A — Build and run the controlled experiment

1. Add the strategy variants and invariant tests.
2. Add the synthetic chunk-sensitive corpus and fixed cases.
3. Add unit-tested metrics and the Local experiment runner.
4. Run the deterministic suite and Local matrix.
5. Record all successful and failed observations in the M2 research document.
6. Present the comparison and recommendation to the user.

### Decision checkpoint

The experiment does not silently change production configuration. The user reviews and approves either:

- the evidence-supported winning configuration; or
- retaining the Milestone 1 `200/30` baseline.

### Phase B — Apply and validate the approved decision

1. Apply the approved production default only if it differs from the baseline.
2. Re-ingest the controlled corpus into isolated validation collections.
3. Validate the selected configuration on Local and Chroma Cloud.
4. Run the fixed Gemini answer and guardrail regression on synthetic data.
5. Run deterministic tests, the frontend build, and the manual Retrieval Debugger check.
6. Update the README, milestone, research document, and master plan with real evidence.

## Commands and verification

The implementation must provide or preserve these root commands:

```bash
npm test
npm run build
npm run experiment:chunking
npm run test:integration:local
npm run test:integration:cloud
npm run test:integration:rag:local
npm run test:integration:rag:cloud
```

Cloud, Gemini, and rendered-browser checks occur in Phase B after the decision checkpoint. Commands that need credentials remain explicit opt-in checks.

## Pass/fail gate

Milestone 2 is complete only when:

1. Every compared configuration uses the same synthetic corpus, questions, embedding model, distance function, and timing method.
2. Baseline and heading-aware chunking are deterministic, lossless after normalization, section-safe, and token-safe.
3. Recall@1/@3/@4/@5, MRR, exact-identifier retrieval, top-four required-fact coverage, chunk counts, and latency are recorded.
4. The Local matrix is reproducible with one documented command.
5. Experiment collections are isolated from production collections and safely cleaned up.
6. The evidence supports a documented recommendation, including a no-change result if appropriate.
7. The user explicitly approves the production decision at the checkpoint.
8. The approved configuration passes deterministic tests plus Local, Cloud, Gemini, and rendered-debugger regression checks.
9. Real commands, outputs, failures, trade-offs, and lessons are recorded in the milestone and research documents.
10. `docs/SupportLens_plan.md` is synchronized with the final status.

## Phase A implementation and evidence

Phase A is implemented and the production decision checkpoint is pending.

### What was built

- Added an explicit heading-aware packing option while retaining the recursive `200/30` production default.
- Corrected recursive overlap so content never crosses a heading boundary.
- Made post-split chunk identifiers unique and deterministic.
- Added three long synthetic support documents and ten chunk-sensitive required-fact cases.
- Added pure evaluation helpers for rank, Recall@1/@3/@4/@5, MRR, exact-identifier recall, top-four required-fact coverage, latency statistics, quality-only selection, and dataset-sensitivity diagnostics.
- Added an isolated Local Chroma experiment runner and the root `npm run experiment:chunking` command.
- Batch-embedded the fixed questions once and measured Chroma query time separately from question embedding.
- Added deterministic chunking and experiment-metric regression tests.

### Verification evidence

| Check | Result |
| --- | --- |
| `npm test` | Passed: 52 tests; two opt-in live RAG tests skipped as designed. |
| `npm run build` | Passed: all frontend routes compiled and prerendered. |
| JavaScript syntax checks | Passed for the experiment runner and metric module. |
| `git diff --check` | Passed. |
| Real-tokenizer bound check | Passed: recursive `200/30` maximum 200 tokens; heading-aware `240/15` maximum 240 tokens; zero over-limit M2 fixture chunks. |
| Final Local matrix | Passed: 25 cases, 10 configurations, unique collections, one warm-up plus three query samples per case, result written, exit code 0. |
| Collection isolation | Passed: after the run only `supportlens_m1_local` remained; no M1 collection was deleted or modified. |

The first two pilot attempts were rejected rather than reported as successes. The first dataset did not differentiate chunk sizes or fact coverage, and the second used forced process termination that triggered a native ONNX failure. Both failures and their corrective evidence are recorded in `docs/Research/Research_M2_Chunking_Strategy_Comparison.md`.

The final independent review found two additional edge cases before the decision checkpoint: a partial configuration failure could still allow selection from an incomplete stage, and a heading exactly equal to a very small token limit could exceed the final bound after body content was added. The runner now fails the whole stage if any planned candidate is missing or fails, while the heading remains metadata-only when it cannot leave body capacity. Focused regression tests cover both corrections.

### Phase A recommendation

The evidence-selected candidate is heading-aware packing with a 240-token maximum and 15-token overlap.

Against the current recursive `200/30` production baseline on nineteen expected-source cases, it improved:

- Recall@1: `0.7895` to `0.8947`.
- Recall@3: `0.9474` to `1.00`.
- MRR: `0.8728` to `0.9474`.
- Exact-identifier Recall@1: `0.6667` to `0.8333`.

Both configurations achieved `1.00` Recall@4, Recall@5, required-fact coverage, and required-fact completion. In the final strategy comparison, heading-aware packing produced 35 chunks versus 49 recursive chunks.

### Current checkpoint

The user approved the `heading-aware 240/15` recommendation and Phase B migration on 2026-09-05.

Phase B will:

- Make heading-aware `240/15` the production ingestion default.
- Move the application to new `supportlens_m2_local` and `supportlens_m2_cloud` collections.
- Reindex each stored document only into its original Local or Cloud target.
- Preserve the M1 collections unchanged for rollback.
- Validate deterministic, Local, Cloud, Gemini, citation, guardrail, build, and rendered-browser behaviour before completion.

At approval time, no production default or normal collection had yet changed. The following Phase B work subsequently completed the milestone.

## Phase B implementation and evidence

### What was built

- Changed the production ingestion default to heading-aware `240/15` and added stable `m2-heading-aware-240-15` chunking-version metadata to document registry records.
- Moved normal application traffic to `supportlens_m2_local` and `supportlens_m2_cloud`, retaining the M1 names for rollback visibility.
- Added `npm run reindex -- local|cloud` to rebuild registered documents only in their original target.
- Added fail-closed reindex validation: prepare embeddings before chunking, build and verify a unique candidate collection, atomically activate it with the registry's chunk metadata, and delete only failed candidates while retaining the prior active collection.
- Made normal ingestion, retrieval, seed, and evaluation operations resolve the current per-target collection pointer, so running processes do not remain attached to a deleted Chroma collection UUID after cutover.
- Made registry mutations reread and merge the latest on-disk state under a bounded cross-process lock, preventing a concurrent upload from being overwritten by reindex metadata. Locks now publish initialized owner metadata plus an immutable per-owner marker atomically, refresh a lease with heartbeats, apply a bounded same-host PID grace period, recover expired abandoned locks only by claiming the exact stale owner, and verify ownership during release.
- Added independent target-operation locks around complete ingestion and reindex Chroma-plus-registry transactions, preventing same-target chunk deletion races without blocking the other target.
- Bounded reindex embedding and Chroma writes to batches of 64, with storage writes capped by Chroma's reported server maximum.
- Added fail-fast production configuration validation: chunk maximum must be 1–240 tokens and overlap must be non-negative and smaller than the maximum.
- Added deterministic tests for environment validation, collection deletion, atomic registry writes, reindex success, target isolation, empty registries, count mismatches, and cleanup failures.
- Bounded the opt-in Cloud RAG test client below its test timeout so stalled SDK requests cannot leave the test process waiting indefinitely.

### Migration results

| Target | Registered documents | M2 chunks | Isolation result |
| --- | ---: | ---: | --- |
| Local | 10 | 46 | Nine synthetic documents plus one existing Local upload; M1 Local retained with 72 chunks. |
| Chroma Cloud | 9 | 9 | Synthetic documents only; the Local-only upload was not copied. |

All migrated records report `m2-heading-aware-240-15`.

### Final verification evidence

| Check | Result |
| --- | --- |
| `npm test` | Passed: 93 tests; two opt-in live RAG cases skipped by default. |
| `npm run build` | Passed: all frontend routes compiled and prerendered. |
| `npm run test:integration:local` | Passed. |
| `npm run test:integration:cloud` | Passed after the test-runner timeout was set above the application's bounded heartbeat timeout. |
| `npm run test:integration:rag:local` | Passed: real MiniLM ingestion and retrieval; transient collection cleaned. |
| `npm run test:integration:rag:cloud` | Passed after final target-lock changes in 12.83 s: real MiniLM ingestion and retrieval; no transient collection remained. |
| Fixed retrieval evaluation | Local and Cloud both achieved Recall@1 `1.00`, Recall@3 `1.00`, MRR `1.00`, and exact-ID Recall@1 `1.00`. |
| Live Gemini regression | 8/8 supported answered; 7/7 unsupported/adversarial used `insufficient_context`; citation validity and expected-status accuracy `1.00`; 6,747 tokens across 12 provider calls. |
| Rendered status and Documents pages | Express, Local, and Cloud connected; 10 Local documents/46 chunks and 9 Cloud documents/9 chunks displayed. |
| Rendered Retrieval Debugger | `payment-errors.md` ranked first for `PAYMENT_4027` on Local and Cloud with scores, model, target, and latency visible. |
| Rendered Cloud Chat | Grounded payment answer cited `payment-errors.md`; an out-of-scope question returned `insufficient_context` without a Gemini call. |
| Syntax and whitespace checks | Passed JavaScript syntax checks and `git diff --check`. |
| Independent final review | GPT-5.6 Sol confirmed the target-lock P1 was resolved and reported no remaining P0–P2 issue in the reviewed Phase B scope. |
| Post-commit safety review | Found three initial gaps: destructive fixed-name replacement and stale UUID handles, permanently abandoned mkdir locks after crashes, and unbounded corpus embedding/storage batches. Follow-up reviews found non-atomic stale takeover, PID-reuse lockout, ambiguous registry-commit cleanup, permanently cached rejected collection promises, unreachable collections after rollback-history truncation, and delayed legacy-lock takeover races. |
| Corrective deterministic verification | Passed: 110 tests with two intentional opt-in skips; focused coverage includes candidate failure preservation, pointer switching, exact-owner stale recovery, two delayed legacy contenders, live-owner/PID-grace behavior, abandoned heartbeat artifacts, ambiguous commits, retry after rejected collection lookup, bounded batches, and rollback eviction. |
| Corrective live integrations | Passed on 2026-09-06: Local heartbeat 39 ms, Cloud heartbeat 983 ms, Local RAG 694 ms, and Cloud RAG 5.58 s of test time; transient test collections were cleaned by their suites. |
| Safe reindex verification | Local activated `supportlens_m2_local_reindex_1788681363287_d119ba84` with 46 chunks and retained four rollback generations at 46 each. Cloud activated `supportlens_m2_cloud_reindex_1788681344464_02e9cabb` with 9 chunks and retained four rollback generations at 9 each. Both runs reported no evictions or cleanup warnings. |
| Corrective retrieval evaluation | Local and Cloud both retained Recall@1 `1.00`, Recall@3 `1.00`, MRR `1.00`, and exact-ID Recall@1 `1.00`. Final Local first/warm retrieval was 133.92 ms/65.85–119.69 ms; Cloud was 1,994.14 ms/360.88–630.07 ms. Gemini was intentionally disabled for these duplicate fixed-suite runs. |
| Corrective live answer | The Cloud question `What does PAYMENT_4027 mean?` returned `answered`, cited the first-ranked `payment-errors.md` chunk, used `gemini-3.5-flash-lite`, and reported 611 total tokens through the new active pointer. |
| Corrective final review | A bounded GPT-5.6 Sol review of the final application diff reported no remaining actionable P0–P2 findings. |

The first Local reindex failed safely when an absent M2 collection used the SDK's `ChromaNotFoundError` shape; the registry and M1 collection were unchanged. The first Cloud RAG integration attempt also exposed an unbounded SDK request during test cleanup and left one synthetic transient collection. The error handling and test lifetime were corrected, the exact leaked collection was removed, the rerun passed, and a final listing found no transient test collections. Final review then identified and corrected unsafe numeric chunk configuration, a concurrent registry lost-update risk, and a same-target Chroma write/reindex race. These failures are retained in the research record.

A later post-commit review on 2026-09-06 found that the rebuild still deleted the active fixed-name M2 collection before verification, could strand a running backend on the deleted collection UUID, could leave permanent lock directories after a crash, and sent the full corpus through single embedding and Chroma-add operations. The corrective implementation introduced verified candidate collections with atomic pointer activation, crash-recoverable owned locks, and bounded batches. Follow-up review hardened competing stale-lock recovery, bounded PID-liveness grace, ambiguous registry-commit handling, rejected collection-promise retries, and bounded rollback cleanup. Independent inspection also found that the first corrective draft had not passed the registry into the seed and evaluation repositories, an abandoned heartbeat temporary file could obstruct stale recovery, and legacy owner-only locks required an ownership-atomic upgrade path; all were fixed before final live verification.

### Gate result

All ten documented pass/fail conditions passed, and the 2026-09-06 corrective safety regression passed. The approved heading-aware `240/15` configuration is active through independently switched Local and Cloud registry pointers; the prior M2 and M1 collections remain available for rollback, and the master plan is synchronized to **Complete**.

## Out of scope

- Changing the embedding model.
- Increasing the production retrieval depth above four.
- Hybrid keyword/vector retrieval.
- Reranking.
- Metadata filtering.
- Changing the Gemini model or adding another answer provider.
- Frontend controls for selecting chunking configurations.
- A full production-sized golden dataset.
- New third-party dependencies.

## Approval record

The user approved starting Milestone 2 on 2026-09-03 after confirming that the existing recursive-overlap strategy should remain the baseline for comparison.

On 2026-09-05, the user approved adopting the evidence-supported heading-aware 240-token, 15-token-overlap configuration, creating versioned M2 Local and Cloud collections, and reindexing existing stored documents while preserving the M1 collections for rollback.

On 2026-09-06, the user approved correcting the post-commit review findings with safe candidate cutover, crash-recoverable locks, bounded reindex batches, regression coverage, live verification, and documentation updates without adding dependencies.
