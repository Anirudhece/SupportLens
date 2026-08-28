# SupportLens — Product Requirements Document

## Document status

- **Status:** Initial draft
- **Product:** SupportLens — Production RAG Knowledge Assistant
- **Purpose:** Define the product problem, scope, requirements, constraints, and success criteria before implementation begins.
- **Source of truth:** This PRD is derived from `docs/PROJECT_CONTEXT.md`. Undecided implementation details remain open rather than being assumed.

## 1. Product overview

SupportLens is a production-oriented knowledge assistant for support engineers and developers. It ingests internal and customer-facing documentation, retrieves the most relevant passages for a question, and generates an answer grounded in those passages with visible citations.

The project is also a learning-focused Applied AI portfolio project. Its implementation must make the important parts of a retrieval-augmented generation (RAG) system explicit, measurable, and explainable instead of hiding them behind high-level orchestration frameworks.

## 2. Problem statement

Support teams work with knowledge spread across product documentation, billing policies, troubleshooting guides, API documentation, runbooks, incident reports, FAQs, release notes, and internal support guides.

Finding the right information is difficult when:

- The question uses different wording from the source document.
- Exact identifiers such as error codes or API fields matter.
- Relevant details are distributed across multiple documents.
- A generated answer cannot be trusted without its supporting evidence.
- Retrieval failures and answer-generation failures are difficult to distinguish.

SupportLens must make this knowledge searchable through natural-language questions while showing enough retrieval evidence for users and developers to validate each answer.

## 3. Target users

### Primary users

- **Support engineers:** Diagnose customer issues and find relevant policies or troubleshooting steps.
- **Developers:** Look up API behaviour, error codes, runbooks, and incident knowledge.

### Secondary users

- **Knowledge-base maintainers:** Upload documents and inspect their ingestion state.
- **AI/RAG engineers:** Evaluate retrieval quality, inspect failures, and compare retrieval strategies.

## 4. Core use cases

1. A support engineer asks what an error code means and receives a grounded answer with supporting sources.
2. A developer asks a question whose wording differs from the documentation and receives semantically relevant passages.
3. A user verifies an answer by opening its document, section, or page citation.
4. A knowledge-base maintainer uploads a document and monitors whether ingestion succeeded.
5. An engineer inspects vector, keyword, hybrid, and reranked results to diagnose a poor answer.
6. An engineer evaluates a retrieval or chunking change against a fixed question set before accepting it.
7. A user asks an unsupported question and receives a clear statement that relevant information was not found.

## 5. Product goals

- Provide answers grounded in the ingested knowledge base.
- Attach verifiable source information to generated answers.
- Support real document ingestion rather than hardcoded knowledge.
- Make retrieval behaviour visible and debuggable.
- Evaluate retrieval separately from answer generation.
- Support measurable experimentation with chunking, retrieval, reranking, and confidence thresholds.
- Build the core RAG pipeline explicitly before adopting high-level RAG frameworks.
- Use PostgreSQL and pgvector as the primary storage and vector-retrieval system.

## 6. Non-goals

The following are outside the initial project scope:

- Building a general-purpose assistant that answers from unrestricted world knowledge.
- Training a foundation model or embedding model from scratch.
- Hiding the retrieval pipeline behind LangChain or LlamaIndex in the first versions.
- Treating an LLM judge as perfect ground truth.
- Adding a dedicated vector database before the pgvector implementation is understood and evaluated.
- Implementing unrelated SaaS features before the core ingestion, retrieval, generation, and evaluation workflow is reliable.

## 7. Functional requirements

### FR-1: Document ingestion

The system must accept knowledge-base documents, including PDF, Markdown, and plain text. For every document, it must:

1. Extract its text.
2. Clean and normalize the extracted content.
3. Split the content into retrievable chunks.
4. Generate an embedding for each chunk.
5. Store the chunk, embedding, and source metadata in PostgreSQL with pgvector.
6. Expose ingestion status and the resulting chunk count.

### FR-2: Chunk metadata

Stored chunks must retain available source metadata, including:

- Source filename or document identifier.
- Section or heading.
- Page number where applicable.
- Product or knowledge category where applicable.
- Document version where applicable.

The data model must permit later metadata-filtered retrieval.

### FR-3: Grounded question answering

The system must allow users to ask natural-language questions. For each question, it must:

1. Generate a query embedding.
2. Retrieve relevant chunks.
3. Select the context provided to the language model.
4. Instruct the model to answer only from that context.
5. Return the answer together with its supporting sources.

The answer-generation prompt must instruct the model not to invent unsupported facts.

### FR-4: Unsupported-question behaviour

When the knowledge base does not contain sufficiently relevant information, the system must say that no relevant information was found instead of fabricating an answer.

The confidence threshold must eventually be evaluated against evidence rather than selected only by intuition.

### FR-5: Citations

Generated answers must identify the sources used. Citations should include the document and, where available, its section and page number.

Users must be able to connect an answer claim to the retrieved content that supports it.

### FR-6: Retrieval visibility

The system must expose the chunks considered for a query, including their source metadata and retrieval scores. It must be possible to inspect which chunks were ultimately supplied to the language model.

### FR-7: Metadata filtering

The retrieval layer must eventually support filters such as product, version, document type, or another stored metadata field.

### FR-8: Hybrid retrieval

The system must eventually combine semantic vector retrieval with keyword retrieval so that it can handle both conceptually similar wording and exact identifiers such as error codes, product names, and API fields.

### FR-9: Reranking

The system must eventually support retrieving a broad candidate set and reranking it before selecting the final context. Its effect must be measured against retrieval without reranking.

### FR-10: Evaluation

The system must support a golden evaluation dataset of approximately 40–50 questions. Each test case must identify the expected source or section and may include an expected answer.

Retrieval evaluation must include appropriate metrics such as:

- Recall@k.
- Precision@k.
- Mean Reciprocal Rank (MRR).

Answer evaluation must consider:

- Correctness.
- Faithfulness to the supplied context.
- Relevance.
- Citation accuracy.
- Unsupported or hallucinated claims.

Evaluation results must make retrieval regressions visible when chunking or retrieval behaviour changes.

## 8. Product surfaces

### Chat

The main question-answering interface. It must show the generated answer and its citations.

### Documents

The knowledge-base management interface. It must support document upload and show each document's ingestion status and chunk count.

### Retrieval Debugger

The technical inspection interface. As capabilities are introduced, it should show:

- The submitted query.
- Vector-search results and scores.
- Keyword-search results and scores.
- The combined candidate set.
- Reranked results.
- The chunks supplied to the language model.

## 9. Non-functional requirements

### Explainability

The system must preserve enough retrieval evidence to explain why a source was selected and why an answer was produced.

### Modularity

Document loading, chunking, embedding, storage, retrieval, prompt construction, answer generation, and evaluation must remain explicit components with clear boundaries.

The retrieval layer should be replaceable so that a future Qdrant exercise does not require rewriting the entire RAG pipeline.

### Testability and reproducibility

Important retrieval and generation changes must be verifiable against repeatable tests or evaluation datasets. Configuration used for meaningful experiments must be recorded.

### Data integrity

Stored chunks must remain traceable to their source documents and metadata. Re-ingestion and failure behaviour will be defined during implementation planning.

### Performance

Latency and scale targets will be established through milestone-specific measurements. No unsupported performance target is assumed in this initial PRD.

### Security and privacy

Authentication, authorization, document access controls, retention, and deployment security require explicit decisions before production deployment. They are not defined by the current project context.

## 10. Initial MVP scope

The first usable version should demonstrate the complete basic vector-RAG path with PostgreSQL and pgvector:

```text
Document upload
      ↓
Text extraction and chunking
      ↓
Embedding generation
      ↓
PostgreSQL + pgvector storage
      ↓
Question embedding and vector retrieval
      ↓
Grounded answer with basic citations
      ↓
Visible retrieved chunks and scores
```

The MVP does not need hybrid search, reranking, an approximate vector index, or a replacement vector database. Those capabilities will be introduced and evaluated in later milestones.

## 11. Planned capability progression

The detailed milestones and their measurable gates will be defined separately in `docs/SupportLens_plan.md`. The current intended progression is:

1. Basic vector RAG with PostgreSQL and pgvector.
2. Chunk-size and overlap experiments.
3. Metadata filtering.
4. Hybrid keyword and vector retrieval.
5. Reranking.
6. Reliable citations and grounded fallback behaviour.
7. Golden dataset and evaluation metrics.
8. Automated regression testing.
9. Optional retrieval-layer migration from pgvector to Qdrant after the primary implementation is understood.

## 12. Success criteria

SupportLens will be successful when it can demonstrate that:

- Documents can be ingested and traced from their stored chunks back to their sources.
- A user can ask a knowledge-base question and receive a context-grounded answer.
- Answers expose citations that users can inspect.
- Unsupported questions produce an explicit fallback instead of an invented answer.
- Engineers can inspect retrieved chunks and diagnose whether a failure came from retrieval or generation.
- Retrieval changes can be compared using a fixed evaluation dataset and measurable metrics.
- Milestone completion is supported by documented verification evidence rather than subjective impressions.

Numeric quality and performance thresholds will be established in milestone plans after baseline measurements exist.

## 13. Constraints and confirmed decisions

- PostgreSQL with pgvector is the primary database and vector store.
- The first implementations will not use LangChain or LlamaIndex.
- Core RAG stages must be implemented explicitly and remain understandable.
- Evaluation is part of the product, not an optional final enhancement.
- Documentation must record real experiments, failures, evidence, and decisions without inventing results.

## 14. Open questions

The following decisions require research or milestone planning before implementation:

- Backend language and web framework.
- Frontend framework and UI architecture.
- Embedding model and provider.
- Answer-generation model and provider.
- Local versus hosted PostgreSQL environment.
- Document storage approach in addition to extracted chunks.
- Initial chunking parameters and tokenizer strategy.
- Keyword-search implementation and hybrid-score fusion method.
- Reranking model or service.
- Authentication, authorization, and knowledge-base tenancy.
- Deployment target, observability stack, cost limits, latency targets, and dataset scale.
- Evaluation annotation process and acceptance thresholds.

These questions must be resolved through approved milestone plans and, where meaningful, documented research rather than silently assumed during coding.
