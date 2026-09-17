# Milestone 4 — Trust, Evaluation, and Regression Protection

## Status

**Complete — 2026-09-17.** The reviewed 45-case corpus, Local retrieval, live answer/citation/security gates, rejected confidence cutoff, versioned accepted baseline, independent no-regression comparison, deterministic tests, build, Cloud smoke, and rendered claim/citation inspection have recorded evidence below. Two answerable cases still falsely refuse and are explicitly accepted as known limitations of the current model-and-prompt setup; this is not a claim of production readiness or proof that a larger model would resolve them.

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

The completed implementation includes the reviewed 45-case fixture, explicit corpus manifest, claim-level generation/validation, deterministic metrics and confidence calibration, fail-closed baseline reports, an isolated Local runner, Chat claim evidence, and tests. The annotations contain 34 answerable and 11 refusal cases, 39 source-backed required facts, four multi-document cases, eight filtered cases, and two expected-empty filters.

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

On 2026-09-17, the user approved clarifying only `g11`, `g21`, and `g22` and strengthening the grounded generation instructions, with no model, threshold, annotation, or dependency change. A GPT-5.6 Luna implementation agent made the application changes. Focused tests passed **8/8**; the full backend suite passed **145 tests** with four expected live skips; the frontend production build passed. The first full-suite attempt failed only because the restricted shell denied HTTP test listeners; the same suite passed with local loopback permission.

Throttled live rerun `0bd9b456-f1fd-41ac-b1e4-c4d990cec19c` completed all 45 cases through 38 Gemini calls without provider, retrieval, answer, or cleanup errors. Required-fact coverage improved from `28/39` (`0.7179`) to `35/39` (`0.8974`), above the required `0.85`. Expected-status accuracy improved to `0.9333`; citation validity, answered-claim source support, critical security, filter correctness, and unsupported-answer behavior were `1.00`. `g11`, `g21`, and `g22` now passed their fact/source checks; `g12` and `g16` no longer falsely refused. `g23`, `g29`, and `g30` still falsely refused despite retrieval of relevant sources. The changed question wording gives the new run a different fixture identity, so the previous run is directional before/after evidence, not a comparable accepted-baseline regression.

At that point the run exited nonzero solely because no baseline had yet been accepted. The three false refusals still needed an explicit disposition; that subsequent work is recorded below and in Research M4.

### Final correction, accepted baseline, and completion — 2026-09-17

The user authorized completing the remaining M4 work and accepting transparently documented limitations. Review found that `g29` retrieved a `documentVersion: v2` chunk, but the generation context omitted its version label. A GPT-5.6 Luna implementation agent added `Document version: v2` to the untrusted context header and covered present/missing metadata in tests. No model, corpus, retrieval strategy, threshold, dependency, or architecture changed. The full backend suite passed **147 tests** with four expected opt-in live skips; the frontend production build and `git diff --check` passed. The prior Cloud smoke remained applicable because the correction changed only generation context formatting.

Candidate live run `e1a1c8f1-3d49-4ab6-bcaf-cb330a207ccd` completed **45/45** cases through 38 paced Gemini calls, with zero retrieval/answer errors or skips and successful temporary-collection cleanup. `g29` switched from false refusal to a correctly cited answer. Recall@3 was `1.00`, MRR `0.9857`, filter correctness `1.00`, citation validity `1.00`, answered-claim source support `1.00`, and critical security passed. Required-fact coverage was **35/39 (`0.8974`)**, above the approved `0.85` gate. Two questions (`g23`, `g30`) falsely refused, while `g22` omitted one requested fact. Benign API-key-policy cases `g41` and `g42` answered with full fact coverage, so policy questions were not broadly refused. The user chose to accept the remaining false refusals as known quality limitations, not relabel the golden cases or claim a proven intrinsic model limit. The reviewed candidate became [the versioned accepted baseline](../../backend/evals/m4-accepted-baseline-v1.json), with those limitations and per-case outcomes recorded.

The first independent comparison `6ffd2044-b933-4ae2-9f79-ee8de8a4daa0` stopped on a 15-second Gemini timeout at `g25`; 20 later answer checks were skipped. Its fail-closed report is interruption evidence, not answer-quality regression. With the same model, timeout, and pacing, one manual rerun `846ad89b-0d79-4040-9635-9d266fbcd2a1` completed **45/45**, with zero errors/skips, successful cleanup, comparable baseline identity, and **no regressions**. It reached **36/39 required facts (`0.9231`)**, status accuracy `0.9556`, citation validity and answered-claim source support `1.00`, critical security pass, and unsupported-answer rate `0.00`; `g23` and `g30` remained the two known false refusals. No automated retry or gate reduction was used.

Rendered Local Chat inspection asked “What does PAYMENT_4027 mean?” and showed an `answered` result with two visible claims: one cited `payment-errors.md · Payment errors`, and the other cited `billing-upgrades.md · Subscription upgrades`. The answer, model/usage line, and claim/source association were visible in the browser. This satisfies the rendered claim/citation gate. The planned M4 gate is complete with the two explicitly documented false-refusal limitations; future model comparison or production hardening remains optional separate work.
