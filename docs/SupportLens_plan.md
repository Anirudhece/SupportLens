# SupportLens — Implementation Plan

## Purpose

This document is the master index for SupportLens implementation milestones. It tracks milestone order, status, purpose, and measurable gates while linking to the detailed milestone documents in `docs/Milestones/`.

The PRD defines what the product must achieve. Each milestone document defines how one approved stage will be implemented and verified.

## Status definitions

- **Planned:** The milestone is identified, but its unresolved questions and implementation plan have not yet been fully approved.
- **Approved:** The user has approved the milestone decisions, scope, dependencies, documentation work, and pass/fail gate.
- **In progress:** Implementation is underway within the approved scope.
- **Blocked:** A documented dependency or decision prevents meaningful progress.
- **Complete:** The documented gate has passed and the implementation evidence has been recorded.

## Required pre-implementation discussion

Before any milestone moves from **Planned** to **Approved**:

1. Review the current PRD, project context, master plan, related research, and repository state.
2. Identify unanswered product, architecture, dependency, data, testing, security, and operational questions that could affect the milestone.
3. Explain the available options and their trade-offs to the user.
4. Record the user's decisions in the milestone document and, when the decision is architectural or experimental, in an appropriate research document.
5. Present the exact implementation scope, files, dependencies, verification steps, and pass/fail gate.
6. Obtain explicit user approval before changing application code or installing dependencies.

An AI agent must not silently fill in an unresolved implementation decision merely to begin coding.

## Milestone overview

| Milestone | Status | Purpose | Detailed gate |
| --- | --- | --- | --- |
| [Milestone 0 — Environment Setup](Milestones/Milestone_0_Environment_Setup.md) | Complete | Establish the JavaScript workspace and prove Local and Cloud ChromaDB connectivity across the frontend and backend. | All documented implementation, Local, Cloud, automated, command, and interactive browser gates passed. |
| [Milestone 1 — Basic Vector RAG](Milestones/Milestone_1_Basic_Vector_RAG.md) | Complete | Build the first explicit ingestion, retrieval, answer-generation, citation, and retrieval-visibility path. | Passed: deterministic tests and build; real MiniLM ingestion/retrieval on Local and Cloud; structured Gemini answers; citation integrity; critical guardrails; fixed baseline evaluation; both rendered browser flows; and evidence documentation. |
| [Milestone 2 — Chunking Experiments](Milestones/Milestone_2_Chunking_Experiments.md) | Complete | Compared recursive chunk-size, overlap, and heading-aware packing, then migrated to the approved heading-aware `240/15` default. | Passed: reproducible Local matrix; lossless/token-safe chunks; retrieval, fact-coverage, chunk-count, and latency evidence; atomic candidate cutover with retained M1/M2 rollback generations; crash-recoverable locks; bounded batches; Local, Cloud, Gemini, build, and rendered-browser regressions. |
| [Milestone 3 — Advanced Retrieval](Milestones/Milestone_3_Advanced_Retrieval.md) | Complete | Add metadata filtering and hybrid keyword/vector retrieval, then measure a reranking capability against the same retrieval cases. | Passed: metadata persistence/filtering, Hybrid and Reranked modes, controlled comparison, Local/Cloud integrations, targeted Gemini, 132 deterministic tests, build, and rendered blank/matching/nonmatching filter flows. Vector-only remains default by evidence-based user decision; native file selection was explicitly waived with equivalent ingestion and rendered evidence. |
| [Milestone 4 — Trust, Evaluation, and Regression Protection](Milestones/Milestone_4_Trust_Evaluation_Regression_Protection.md) | In progress | Strengthen claim-level citations, expand to approximately 45 reviewed golden cases, calibrate fallback, and automate quality-regression reports. | The reviewed 45-case corpus passed retrieval, citation validity, critical guardrail, filter, and unsupported-answer gates. The throttled live run completed without execution errors, but fact coverage was `0.7179` against the `0.85` gate and five answerable cases falsely refused. Prompt/dataset correction, a passing accepted baseline and comparison, and rendered claim inspection remain pending. |

An optional managed-vector-database comparison is not a committed milestone. It may be proposed only after the local ChromaDB implementation is understood and evaluated.

The former Milestones 3–5 were combined into Advanced Retrieval, and the former Milestones 6–8 were combined into Trust, Evaluation, and Regression Protection. Their capabilities remain individually testable. The combined plan has five milestones numbered 0–4; Milestones 0–2 retain their completed records and numbering.

## Naming convention

Detailed milestone files use:

```text
docs/Milestones/Milestone_<number>_<Name>.md
```

Example:

```text
docs/Milestones/Milestone_0_Environment_Setup.md
```

Only create a detailed milestone document when that milestone is ready for discussion and planning.
