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
| Milestone 1 — Basic Vector RAG | Planned | Build the first explicit ingestion, retrieval, answer-generation, citation, and retrieval-visibility path. | To be defined after its pre-implementation discussion. |
| Milestone 2 — Chunking Experiments | Planned | Compare chunk-size and overlap strategies using fixed evaluation questions. | To be defined after a baseline exists. |
| Milestone 3 — Metadata Filtering | Planned | Add and verify metadata-aware retrieval. | To be defined during milestone planning. |
| Milestone 4 — Hybrid Retrieval | Planned | Combine keyword and vector retrieval for semantic questions and exact identifiers. | To be defined during milestone planning. |
| Milestone 5 — Reranking | Planned | Rerank a broader candidate set and measure whether relevance improves. | To be defined during milestone planning. |
| Milestone 6 — Citations and Grounded Fallback | Planned | Strengthen claim-to-source traceability and unsupported-question behaviour. | To be defined during milestone planning. |
| Milestone 7 — Golden Dataset and Evaluation | Planned | Build the full evaluation dataset and measure retrieval and answer quality separately. | To be defined from real baseline evidence. |
| Milestone 8 — Automated Regression Testing | Planned | Turn approved evaluation checks into repeatable regression protection. | To be defined after the evaluation workflow is reliable. |

An optional managed-vector-database comparison is not a committed milestone. It may be proposed only after the local ChromaDB implementation is understood and evaluated.

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
