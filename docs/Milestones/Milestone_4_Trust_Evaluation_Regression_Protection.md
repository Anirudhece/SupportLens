# Milestone 4 — Trust, Evaluation, and Regression Protection

## Status

**In progress.** The user approved the ten planning decisions on 2026-09-15 and accepted the 45 golden annotations on 2026-09-16. Local retrieval gates passed and the fixed confidence cutoff was rejected from measured evidence. The throttled live run completed all 45 cases without execution errors, but required-fact coverage failed its gate; prompt/dataset correction, a passing accepted baseline and comparison, and rendered claim inspection remain outstanding.

## Goal and reason

Turn SupportLens quality claims into reproducible evidence. Separately detect failures in retrieval, answer facts, citation support, refusals, and guardrails so a future change cannot silently degrade the application. This is the final currently planned milestone, not a claim of production readiness.

## Concepts being learned

- Golden datasets, explicit annotations, review, and reproducible baselines.
- Retrieval Recall@k, Precision@k, MRR, and exact-identifier ranking.
- Expected-fact coverage, forbidden claims, answer status, claim-to-source attribution, and the limits of deterministic checks.
- Security cases, false refusals, confidence calibration, and regression gates.
- Machine-readable and human-readable evidence with truthful skipped/failed states.

## Approved decisions

1. Expand the synthetic evaluation to approximately **45 cases**: factual, paraphrase, exact identifiers, multi-document, metadata filters, unsupported, prompt injection, secret extraction, citation spoofing, and embedded malicious instructions. Annotate expected status/sources, required and forbidden facts, and filters before accepting results.
2. Draft expected answers from version-controlled synthetic documents. Make all annotations visible for user review. A model does not define the ground truth; a draft is not described as reviewed.
3. Use deterministic checks, no paid evaluation model or new dependency. Live Gemini answer evaluation is explicitly opt-in, regardless of whether a key is configured.
4. Generate individual claims with citation IDs. Validate that every answered claim is nonempty and cites supplied safe context. Derive the combined `answer` string and overall `citationIds` for API compatibility. Keep the frontend simple while making claim evidence inspectable.
5. Measure expected status, required-fact coverage, forbidden-fact violations, citation validity, annotated fact/source support, and unsupported-answer rate. An ID belonging to context is not proof of semantic support. Deterministic fact/source checks are bounded proxies on the golden corpus, not universal hallucination detection.
6. Experiment with supported/unsupported retrieval score distributions. Adopt a confidence cutoff only if a useful safe separation is measured. Otherwise document rejection and retain the guarded context-only Gemini fallback. Do not silently enable a cutoff or weaken supported-case behavior to make the experiment pass.
7. Add `npm run eval:regression`: isolated fixed Local corpus, saved comparable baseline, JSON/Markdown reports, and nonzero exit for required failures. Initial runs create candidate evidence, not automatic baseline acceptance. Errors and skipped checks cannot inflate scores or count as passed gates.
8. Local Chroma gets the complete evaluation; Cloud gets an integration smoke check. Gemini is opt-in to protect quota. Ordinary deterministic tests need no Gemini credentials. Continue using MiniLM, heading-aware `240/15`, vector default, and the existing Gemini model; M3's optional modes remain available.
9. Approved gates: citation validity **100%**; critical security cases **100%**; metadata filter correctness **100%**; Recall@3 **at least 90%**; MRR **at least 0.80**; required-fact coverage **at least 85%**; no unexplained regression from the accepted comparable baseline. Thresholds cannot be adjusted to conceal failed cases. Establish and review the first complete baseline rather than treating older differently sized datasets as comparable.
10. No evaluation dashboard or GitHub Actions in this milestone. CLI reports and documented evidence are the deliverables. No dependency, model, storage, or deployment migration is approved.

## Implementation and documentation plan

1. Record this approved scope and synchronize the master plan/project context.
2. A specifically selected GPT-5.6 Luna implementation agent adds the dataset/fixtures, fact and citation evaluators, report/baseline comparison, isolated evaluation runner, npm scripts, claim-structured generation/validation, and focused regression tests. Preserve earlier milestone runners and application behavior unless the approved citation upgrade requires adaptation.
3. Planning agent reviews application changes. Verify schema failures, fabricated/unsafe citations, false-refusal cases, fixed metric denominators, missing cases, fixture/baseline incompatibility, cleanup, quota/time bounds, and nonzero exits. Make corrections through Luna.
4. Run focused tests, then the deterministic suite and frontend build. Run real Local retrieval and score calibration using only unique temporary collections; do not contaminate or reindex the user's knowledge base. Run Cloud smoke checks if configured. Execute live synthetic Gemini only with explicit opt-in, sequential bounded calls, no automatic retries or larger-model fallback.
5. Record real experiments, failures, alternatives, and results in `docs/Research/Research_M4_Trust_Evaluation_Regression_Protection.md`. Reports belong under ignored `backend/.local/evals/`; the synthetic dataset and an explicitly accepted baseline are version-controlled.
6. Present the golden annotations and candidate baseline for user review. Pending review or live checks keep this milestone In progress. Update README/PRD/context/master plan with verified commands and results, never inferred passes.

## Expected change areas

- `backend/evals/`: synthetic golden fixtures, cases, and baseline evidence.
- `backend/src/evals/` and `backend/scripts/`: pure evaluators, reporting, calibration, isolated runner, regression comparison.
- `backend/src/services/generationService.js`, answer validation, relevant routes/tests: claim-structured grounded output and guardrail regressions.
- `frontend/src/app/chat/page.js` and existing API handler/tests only as needed for inspectable claims and compatibility.
- Root/backend `package.json`: evaluation commands; no dependency addition.
- This milestone, M4 research, `docs/PRD.md`, `docs/SupportLens_plan.md`, `docs/PROJECT_CONTEXT.md`, and `README.md`: synchronized scope and evidence.

## Completion gate

- Golden dataset has approximately 45 fully annotated cases and explicit user review.
- Complete Local retrieval passes Recall@3/MRR and filter gates; metrics include every applicable case, including failed cases.
- Live answer evaluation passes fact coverage, citation and critical guardrail gates. Refusal, forbidden-fact, annotated source support, latency, usage, errors, and skipped cases remain visible individually.
- Citation schema and deterministic adversarial/provider/error regressions pass; normal security-policy questions are not broadly refused.
- Confidence experiment has a recorded adoption or rejection outcome supported by real score evidence.
- An accepted versioned baseline is compared by a repeatable command. Injected regression tests prove bad results cause nonzero failure; incompatible or missing baselines fail clearly.
- Cloud smoke, full deterministic tests, frontend build, and rendered claim/citation inspection pass or any narrowly scoped user waiver is explicitly recorded.
- Research and all status documents reflect executed evidence. No remaining required gate is labeled passed merely because implementation exists.

## Verification evidence and lessons

Implementation is underway. Application implementation now includes the 45-case draft, explicit corpus manifest, claim-level generation/validation, deterministic metrics and confidence calibration, fail-closed baseline reports, an isolated Local runner, Chat claim evidence, and tests. The final annotations contain 34 answerable and 11 refusal cases, 39 source-backed required facts, four multi-document cases, eight filtered cases, and two expected-empty filters.

Changed files so far:

- `backend/evals/golden-cases.json`, `backend/evals/corpus-manifest.json`
- `backend/src/evals/trustMetrics.js`, `backend/src/evals/confidenceCalibration.js`, `backend/src/evals/regressionReport.js`
- `backend/scripts/runRegressionEval.js`, root and backend `package.json`
- `backend/src/services/generationService.js`, `backend/src/validation/answerSchema.js`, `backend/src/routes/ragRoutes.js`
- `backend/tests/generation.test.js`, `backend/tests/trustMetrics.test.js`, `backend/tests/goldenFixture.test.js`
- `frontend/src/app/chat/page.js`
- `README.md`, `docs/PRD.md`, `docs/PROJECT_CONTEXT.md`, `docs/SupportLens_plan.md`, this milestone, and Research M4

Verification on 2026-09-15 with pinned Node `v24.20.0`:

- Full deterministic backend suite: **141 passed**, **4 expected live skips**.
- Post-review M4-focused suite: **19 passed**.
- Frontend production build: passed for all application routes.
- Real Chroma Cloud RAG smoke: **2 passed**, **2 expected opposite-target/live-Gemini skips**; no Gemini calls.
- Default regression command against offline Local Chroma: exited nonzero promptly and wrote uniquely scoped JSON/Markdown failure evidence instead of hanging or reporting success.
- `git diff --check`: passed.

The user reviewed and accepted all 45 golden questions/annotations on 2026-09-16. With Local Chroma running, `npm run eval:regression` completed the retrieval-only corpus with zero retrieval errors: source-coverage Recall@1 `0.90`, Recall@3 `1.00`, MRR `0.9857`, Precision@3 `0.4190`, exact-identifier Recall@1 `1.00`, and filter correctness `1.00`. Cleanup of the uniquely named temporary collection passed. The command deliberately exited nonzero because all 45 live answer checks were skipped and no accepted baseline exists; those are truthful pending gates, not retrieval failures.

The confidence experiment found no safe fixed cutoff. At `0.30`, no supported cases were falsely refused but two unsupported cases remained accepted. At `0.40`, no unsupported cases remained accepted but five supported cases were falsely refused. Supported scores reached as low as `0.3474`, while unsupported scores reached as high as `0.3811`. Per the approved adoption rule, no cutoff is enabled and the existing guarded answer fallback remains in place.

A user-approved live Gemini pilot completed 16 cases before HTTP 429 at `g17` on 2026-09-16. It was interrupted evidence, not a passed live gate. The user approved an M4-only 4.5-second provider-call interval and a two-phase runner correction to preserve retrieval metrics and distinguish provider errors/skips from real quality failures. No retries, prompt/model changes, or expectation changes were included. The full deterministic suite then passed **144 tests** with four expected live skips.

The corrected live run `4a5230a4-c711-4836-a1e5-f3106fc2366e` completed all 45 cases through 38 actual Gemini calls with no quota stop, retrieval error, answer error, or skipped answer. Cleanup passed. Retrieval retained Recall@3 `1.00`, MRR `0.9857`, exact-ID Recall@1 `1.00`, and filter correctness `1.00`. Citation validity, critical security behavior, and unsupported-answer behavior passed `1.00`; forbidden-fact violations remained zero. The run used 19,238 total provider tokens.

The answer gate failed: expected-status accuracy was `0.8889` and required-fact coverage was `0.7179`, below `0.85`. Five answerable cases (`g12`, `g16`, `g23`, `g29`, `g30`) falsely refused. Three answered cases (`g11`, `g21`, `g22`) omitted required facts or expected source coverage. These are not hidden by accepting a baseline. The run correctly exited nonzero for fact coverage, claim/source support, and missing accepted baseline.

No prompt or golden-case correction, accepted answer baseline, baseline comparison, or rendered claim-level browser check has been performed. Therefore the completion gate remains open and the status correctly remains **In progress**. Detailed findings are in Research M4.
