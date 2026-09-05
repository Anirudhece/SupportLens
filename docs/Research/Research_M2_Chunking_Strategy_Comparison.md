# Research M2 — Chunking Strategy Comparison

## Status

- **Status:** Complete
- **Started:** 2026-09-03
- **Completed:** 2026-09-05
- **Related milestone:** `docs/Milestones/Milestone_2_Chunking_Experiments.md`

## Purpose

Record the real evidence from controlled SupportLens chunking experiments. This document must distinguish planned hypotheses from observed results and must retain failures or neutral results rather than rewriting them after a preferred configuration is known.

## Baseline under test

- Strategy: custom recursive boundary-aware splitting.
- Boundary order: paragraph, sentence, word, then character.
- Maximum size: 200 `all-MiniLM-L6-v2` WordPiece tokens.
- Overlap: 30 tokens.
- Production retrieval depth: four chunks.
- Embedding model: `Xenova/all-MiniLM-L6-v2`.
- Vector store: Local ChromaDB for the full matrix.

## Questions

1. Does a smaller or larger chunk size improve difficult expected-source ranks?
2. Does overlap improve facts that lie near boundaries, and what duplication cost does it introduce?
3. Does heading-aware packing keep lists and related explanations together more effectively than paragraph-first splitting?
4. Does the top-four context contain every fact required for complete answers?
5. Do any variants lose or reorder normalized source content?
6. What chunk-count, ingestion-latency, and retrieval-latency trade-offs are observed?
7. Does the selected configuration preserve Local and Cloud retrieval parity and the Milestone 1 answer/guardrail baseline?

## Hypotheses

These are expectations to test, not results:

- Heading-aware packing may improve complete-list and multi-fact coverage by keeping related blocks under one heading together.
- Smaller chunks may improve precision for narrow questions but fragment multi-fact answers and increase chunk count.
- Larger chunks may improve fact completeness but introduce distractor text.
- More overlap may protect boundary facts while increasing duplication and storage work.
- The current `200/30` configuration may remain the best trade-off.

## Controls

- Same normalized synthetic corpus.
- Same fixed question wording and expected sources.
- Same MiniLM embedding model and tokenizer.
- Same cosine-compatible Chroma collection configuration.
- Same candidate depth for metric calculation.
- Same production top-four boundary for fact coverage.
- One warm-up plus three timed retrieval runs.
- One changed chunking variable per comparison stage.

## Planned matrix

### Stage 1 — Recursive chunk size

| Configuration | Maximum tokens | Overlap tokens | Strategy |
| --- | ---: | ---: | --- |
| Recursive 100/30 | 100 | 30 | Recursive |
| Recursive 150/30 | 150 | 30 | Recursive |
| Recursive 200/30 | 200 | 30 | Recursive baseline |
| Recursive 240/30 | 240 | 30 | Recursive |

### Stage 2 — Recursive overlap

Use the evidence-supported Stage 1 size and compare overlap values `0`, `15`, `30`, and `45`.

### Stage 3 — Semantic packing

Compare the strongest recursive configuration with heading-aware packing using the same maximum size and overlap.

## Metrics

- Recall@1, Recall@3, Recall@4, and Recall@5.
- Mean Reciprocal Rank.
- Exact-identifier recall.
- Required-fact coverage within the production top four.
- Per-case expected-source rank and missing required facts.
- Chunk count and average WordPiece token count.
- Ingestion latency.
- Retrieval latency after warm-up.

## Results

### Experiment implementation

The Phase A implementation added:

- Explicit `recursive` and `heading-aware` chunking strategies while retaining recursive `200/30` as the production default.
- Section-safe overlap for both strategies, including a regression test proving that text from one heading is not carried into another heading.
- Deterministic reindexing after final safety splits so returned chunk identifiers remain unique.
- Three long synthetic support documents and ten chunk-sensitive cases. Combined with the fifteen Milestone 1 cases, the matrix evaluated twenty-five fixed questions, nineteen with an expected source, six marked as exact-identifier cases, and ten with required facts.
- Isolated Local Chroma collections with a unique run prefix and cleanup after every configuration.
- Source-rank, required-fact, chunk-layout, ingestion, and robust query-latency measurements.
- Quality-only lexicographic selection with an explicit preference for the current control when quality ties. Sequential-run latency and chunk count are descriptive and cannot select the winner.

### Failed pilot 1 — insufficiently sensitive data

The first real run, `bfa79693b6e8`, proved that the initial experiment harness worked but that its corpus was not suitable for the decision:

- Recursive `150/30`, `200/30`, and `240/30` produced the same 32-chunk layout and identical quality metrics.
- Every configuration achieved `1.00` required-fact coverage and completion within the top four.
- Fixed sequential timing accumulated latency, including one `36,162.88 ms` outlier.
- The original selector allowed that confounded latency to break a quality tie and recommended `100/15`.
- The CLI wrote its result and cleaned its collection but retained a runtime handle after output.

This recommendation was rejected. The result demonstrated that a technically successful run is not useful evidence when the dataset does not exercise the variable under study.

### Failed pilot 2 — meaningful data, unsafe forced exit

The fixtures were expanded to 2,391 words with coherent sections exceeding the candidate token limits, and the required-fact cases were strengthened. Run `afc2fc9ecb1c` then produced distinct layouts and quality results, but an attempted forced `process.exit(0)` caused the native ONNX runtime to terminate with a mutex error after output. The shell received exit code 1 even though the JSON was written and the experiment collection was cleaned.

Inspection of the installed embedding wrapper showed that every `generate()` call constructs a Transformers feature-extraction pipeline. The runner had embedded the same question again for every warm-up and timed retrieval, creating approximately one thousand unnecessary model invocations. This also made the original latency measurement primarily an embedding-runtime measurement rather than a Chroma retrieval comparison.

That run was retained as diagnostic evidence but rejected as a passing experiment.

### Final controlled Local run

Run `39e80372411f` corrected the measurement design:

- One shared MiniLM provider was prepared once.
- All twenty-five fixed questions were embedded in one batch taking `237.31 ms`.
- The same query vectors were used for every chunking configuration.
- Each case received one Chroma-query warm-up and three timed Chroma queries.
- Per-case and aggregate medians were recorded alongside means and all raw samples.
- The command completed its work in approximately `17.7 s`, wrote the JSON result, exited with code `0`, and left only the normal `supportlens_m1_local` collection.

The final aggregate results were:

| Stage | Configuration | Chunks | Avg. tokens | Recall@1 | Recall@3 | Recall@4 | Recall@5 | MRR | Exact ID R@1 | Fact coverage@4 | Complete facts@4 | Median query |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Size | Recursive 100/30 | 81 | 66.64 | 0.7895 | 0.9474 | 0.9474 | 1.00 | 0.8702 | 0.6667 | 0.9417 | 0.80 | 1.00 ms |
| Size | Recursive 150/30 | 58 | 80.69 | 0.7895 | 0.9474 | 1.00 | 1.00 | 0.8728 | 0.6667 | 1.00 | 1.00 | 0.88 ms |
| Size | Recursive 200/30 control | 51 | 87.57 | 0.7895 | 0.9474 | 1.00 | 1.00 | 0.8728 | 0.6667 | 1.00 | 1.00 | 0.91 ms |
| Size | Recursive 240/30 | 50 | 88.58 | 0.7895 | 1.00 | 1.00 | 1.00 | 0.8860 | 0.6667 | 1.00 | 1.00 | 0.90 ms |
| Overlap | Recursive 240/0 | 47 | 79.38 | 0.6842 | 1.00 | 1.00 | 1.00 | 0.8421 | 0.6667 | 0.90 | 0.90 | 0.79 ms |
| Overlap | Recursive 240/15 | 49 | 82.96 | 0.8421 | 1.00 | 1.00 | 1.00 | 0.9211 | 0.8333 | 1.00 | 1.00 | 0.78 ms |
| Overlap | Recursive 240/30 control | 50 | 88.58 | 0.7895 | 1.00 | 1.00 | 1.00 | 0.8860 | 0.6667 | 1.00 | 1.00 | 0.77 ms |
| Overlap | Recursive 240/45 | 50 | 95.60 | 0.7368 | 1.00 | 1.00 | 1.00 | 0.8509 | 0.6667 | 1.00 | 1.00 | 0.82 ms |
| Strategy | Recursive 240/15 control | 49 | 82.96 | 0.8421 | 1.00 | 1.00 | 1.00 | 0.9211 | 0.8333 | 1.00 | 1.00 | 0.78 ms |
| Strategy | Heading-aware 240/15 | 35 | 108.26 | 0.8947 | 1.00 | 1.00 | 1.00 | 0.9474 | 0.8333 | 1.00 | 1.00 | 0.75 ms |

The candidate-size stage had four distinct layouts and four distinct chunk counts. The overlap stage had four distinct layouts and three distinct chunk counts. Required-fact coverage varied in both stages, proving that the final dataset exercised the selected variables.

### What changed at case level

- Recursive `100/30` placed the Milestone 1 `Retry-After` case at rank 5, below the production top four. Its top four also omitted `express@5.2.1` and `zod@4.5.4` from the complete dependency list and missed one idempotency fact.
- Recursive `240/0` retrieved the expected dependency source at rank 1 but included none of the six required dependency values in the top four. This directly reproduces the Milestone 1 lesson that expected-source rank alone does not prove answer completeness.
- Moving from the production `200/30` baseline to recursive `240/15` moved the `Retry-After` case from rank 4 to rank 1 and the upgrade case from rank 3 to rank 2.
- Heading-aware `240/15` moved the upgrade case from rank 2 to rank 1. It returned seventeen of nineteen expected sources at rank 1, compared with fifteen of nineteen for the production baseline.
- Heading-aware `240/15` reduced total chunks from 49 to 35 compared with recursive `240/15`, while preserving perfect Recall@3/@4/@5 and complete required-fact coverage on this dataset.

### Token-bound smoke check

The actual MiniLM tokenizer was applied directly to the three M2 fixtures:

| Configuration | M2 fixture chunks | Largest observed chunk | Over limit |
| --- | ---: | ---: | ---: |
| Recursive 200/30 baseline | 38 | 200 | 0 |
| Heading-aware 240/15 recommendation | 26 | 240 | 0 |

The 240-token limit retains sixteen tokens of headroom below MiniLM's 256-token model boundary before accounting for model-added special tokens.

## Failures and deviations

- The first corpus did not create meaningful chunk-size or fact-coverage differences. It was strengthened before accepting a recommendation.
- Repeating question embedding inside every timed retrieval both measured the wrong work and accumulated native model resources. Question embeddings are now generated once because that work is identical across chunk configurations.
- Forced process termination caused a native ONNX mutex failure. The final runner uses normal completion and sets an exit code only on failure.
- Final review found that a failed candidate could be omitted while selection continued over the remaining stage results. Stage validation now requires every planned configuration to succeed before any recommendation can be produced.
- Final review also found an equality edge case where a heading consumed the entire configured token limit. Such a heading now remains in metadata rather than content, and a final heading-aware token assertion protects the invariant.
- The desktop tool delayed delivery of the final command output, but the underlying application command reported approximately `17.7 s` and exit code `0`. This orchestration delay is not included in application latency.
- The dataset is synthetic and small. The measured recommendation is a controlled project result, not a universal chunking rule.

## Recommendation

The Phase A evidence recommends **heading-aware packing with a 240-token maximum and 15-token overlap**.

Compared with the current recursive `200/30` production baseline, the recommendation:

- Improves Recall@1 from `0.7895` to `0.8947`.
- Improves Recall@3 from `0.9474` to `1.00`.
- Improves MRR from `0.8728` to `0.9474`.
- Improves exact-identifier Recall@1 from `0.6667` to `0.8333`.
- Preserves Recall@4, Recall@5, required-fact coverage, and required-fact completion at `1.00`.
- Reduces the final strategy-comparison chunk count from 49 recursive chunks to 35 heading-aware chunks.

The user approved this recommendation on 2026-09-05. Phase B then applied and validated it as described below.

## Phase B production validation

### Applied configuration and migration

- Production ingestion now defaults to `heading-aware`, a 240-token maximum, and 15-token overlap.
- Document registry records store the stable chunking version `m2-heading-aware-240-15`.
- Normal application traffic now uses `supportlens_m2_local` and `supportlens_m2_cloud`.
- The prior `supportlens_m1_local` and `supportlens_m1_cloud` collections remain unchanged for rollback.
- `npm run reindex -- local|cloud` rebuilds only the selected target from its registered source documents, verifies the resulting chunk count, and updates registry records only after the collection succeeds.
- Registry persistence uses a same-directory temporary file followed by atomic rename. Every mutation rereads the latest state under a shared, bounded cross-process lock, so an upload completed during reindex preparation is merged rather than overwritten. Failed collection work attempts cleanup and preserves the original registry on disk.
- Ingestion and reindex also share independent Local and Cloud operation locks around their complete Chroma-plus-registry transactions. A reindex therefore cannot delete chunks written by an overlapping same-target upload, while Local and Cloud operations remain independent.

The Local migration reindexed 10 registered documents into 46 chunks: the nine synthetic fixtures produced one chunk each, and the previously uploaded Milestone 1 Markdown document produced 37 chunks. The preserved M1 Local collection still contained 72 chunks. The Cloud migration reindexed only its nine synthetic documents into nine chunks. The Local-only uploaded document was not copied to Cloud or sent to Gemini.

### Retrieval and answer regression evidence

The fixed 15-case retrieval evaluation passed on both migrated targets:

| Target | Recall@1 | Recall@3 | MRR | Exact-ID Recall@1 | Observed retrieval latency |
| --- | ---: | ---: | ---: | ---: | --- |
| Local | 1.00 | 1.00 | 1.00 | 1.00 | First request 237.21 ms; later requests 68–99 ms. |
| Chroma Cloud | 1.00 | 1.00 | 1.00 | 1.00 | First request 5198.83 ms; warm requests approximately 371–436 ms. |

The live Gemini regression used only the Cloud synthetic corpus and `gemini-3.5-flash-lite`:

- 8/8 supported cases returned `answered`.
- 7/7 unsupported or adversarial cases returned `insufficient_context`.
- Citation validity and expected-status accuracy were both `1.00`.
- Three high-risk cases used deterministic fallback without a provider call.
- Twelve Gemini calls used 6,747 total tokens, with 562.25 mean tokens per call.
- Provider latency across those calls was 1,581.34 ms mean and 1,550.205 ms median, ranging from 912.04 to 2,802.08 ms.

### Integration and rendered-browser evidence

- Local and Cloud heartbeat integration tests passed.
- Real Local and Cloud RAG tests both ingested, embedded, retrieved, and cleaned uniquely named transient collections. After the final target-lock correction, Local completed in 606 ms of test time and Cloud in 12.63 s of test time.
- The rendered status page showed Express, Local Chroma, and Chroma Cloud connected.
- The rendered Documents page showed 10 Local documents/46 chunks and 9 Cloud documents/9 chunks.
- For `What does PAYMENT_4027 mean?`, the Retrieval Debugger ranked `payment-errors.md` first on both targets. The observed rendered retrieval times were 369.16 ms Local and 2,847.21 ms Cloud.
- Cloud Chat returned a grounded answer citing `payment-errors.md` for the payment question. It returned `insufficient_context` for an out-of-scope football question and reported that Gemini was not called.
- The deterministic suite passed 93 tests with two intentional opt-in skips, the frontend production build passed, JavaScript syntax checks passed, and `git diff --check` passed.
- A focused GPT-5.6 Sol re-review confirmed that the target-lock concurrency finding was resolved and found no remaining P0–P2 issue in the reviewed Phase B scope.

### Phase B failures and corrections

- The first Local reindex attempt encountered the SDK's `ChromaNotFoundError` when the M2 collection did not yet exist. The repository now recognizes that exact absent-collection response while still surfacing connectivity and permission errors. Registry checksum and M1 collection state were unchanged after the failed attempt.
- The first live Cloud RAG test exceeded Vitest's 120-second timeout because Chroma SDK collection operations had no request bound; its awaited cleanup continued after the test timeout and left one uniquely named synthetic collection. That exact transient collection was deleted and verified absent.
- The Cloud integration client now has a 90-second total-lifetime abort signal, below the 120-second test timeout and covering cleanup. The rerun passed in 6.78 seconds, and a collection listing confirmed that no `sl_m1_cloud_*` or `sl_m2_cloud_*` transient collections remained.
- Final review found that atomic rename alone could still overwrite an upload written by another process between the reindex read and registry update. Registry reads now refresh from disk, and all mutations serialize through the same five-second bounded lock before rereading and merging current state. Regression tests preserve an external addition, verify lock cleanup after success and failure, and prove a held lock fails closed.
- Follow-up review identified a second interleaving: a concurrent upload could write Chroma chunks before taking the registry lock, after which reindex could delete those chunks while preserving the new registry record. The full ingestion and reindex transactions now use the same target-specific operation lock. A deterministic gated test proves a same-target upload cannot add chunks during rebuild preparation, and another test proves Local and Cloud locks do not block each other. Ingestion fails closed if the lock contract is unavailable.
- Final review also found that environment values could exceed the selected MiniLM safety envelope or request overlap greater than the chunk. Explicit chunk maxima must now be integers from 1 through 240, and overlap must be a non-negative integer strictly below the effective maximum. Invalid values fail at configuration load and are covered by parameterized tests.
- The normal backend watch command hit the host's open-file limit (`EMFILE`) during browser setup. The same server entrypoint was run without watch mode for rendered verification; no application behaviour or production configuration changed.

## Final decision

Milestone 2 adopts **heading-aware packing with a 240-token maximum and 15-token overlap**. The controlled experiment showed better first-result ranking and fewer chunks than the Milestone 1 recursive baseline while preserving top-four fact coverage. The migrated Local and Cloud regressions, Gemini checks, and rendered application checks all passed. This is the measured SupportLens default, not a claim that the configuration is universally optimal.

## Evidence boundary

Do not report a winning strategy, metric, timing, Local/Cloud comparison, or Gemini result unless the corresponding command was actually run and its output was inspected.
