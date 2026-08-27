# SupportLens — Project Context

This document preserves the important context from the original ChatGPT discussion and the related Notion notes so that future sessions can continue the project without requiring the original conversation.

## Background and objective

The goal is to build a serious portfolio project for transitioning from an experienced software-engineering role into an Applied AI / LLM Engineering role.

The project should:

- Teach how RAG works internally rather than hiding the important concepts behind frameworks.
- Resemble a real production-oriented internal product rather than a basic “chat with a PDF” demo.
- Use technologies that are relevant to current AI-engineering jobs.
- Produce measurable results that can be explained and defended in interviews.
- Build on existing backend and database experience while adding new AI-engineering, embedding, and vector-retrieval skills.

## Vector database decision

MongoDB Vector Search, ChromaDB, PostgreSQL with pgvector, Pinecone, Qdrant, and Weaviate were considered. The shortlist was later narrowed to ChromaDB and Pinecone because the project should focus on AI retrieval and purpose-built vector-database concepts rather than introduce SQL as a separate learning and interview obligation.

The final choice for the main project is **ChromaDB** because it supports the intended learning progression:

- Begin with automatic local embeddings to establish a working retrieval baseline.
- Replace the automatic embedding function with an explicitly managed local or hosted model.
- Supply precomputed vectors so embedding generation and vector storage remain separate, understandable components.
- Compare embedding models locally without depending on a paid hosted database or inference service.

ChromaDB's default embedding function uses the open-weight `all-MiniLM-L6-v2` model locally; it is not a proprietary Chroma model. That default is a possible baseline, not the approved production embedding model. The embedding model and provider remain open decisions that must be evaluated separately.

PostgreSQL with pgvector was not selected because learning and defending PostgreSQL is no longer a primary objective for this project. Pinecone remains a credible managed alternative, but selecting it now would move embedding execution and vector infrastructure behind a hosted service. A future managed-service comparison may be considered after the ChromaDB implementation is understood and evaluated, but it is not currently a committed milestone.

## Framework decision

The first versions should not use LangChain or LlamaIndex.

The important stages should be implemented explicitly:

```text
loadDocument()
      ↓
chunkDocument()
      ↓
generateEmbeddings()
      ↓
storeChunks()
      ↓
embedQuestion()
      ↓
retrieveTopK()
      ↓
buildPrompt()
      ↓
generateAnswer()
```

Frameworks may be introduced later, after the underlying behaviour and trade-offs are understood.

## Product definition

The project is called **SupportLens — Production RAG Knowledge Assistant**.

Imagine a SaaS company with hundreds or thousands of internal and customer-facing documents:

- Product documentation
- Billing policies
- Troubleshooting guides
- API documentation
- Runbooks
- Incident reports
- FAQs
- Release notes
- Internal support guides

A support engineer or developer can ask a question such as:

> Why is a customer seeing PAYMENT_4027 after upgrading their plan?

SupportLens retrieves the relevant knowledge, generates an answer grounded in that knowledge, and shows the supporting sources.

For example, if the knowledge base says that upgrades cause an immediate prorated charge and that `PAYMENT_4027` occurs when the previous payment method has expired, SupportLens should answer that the upgrade charge failed because the stored payment method is no longer valid.

The answer should cite sources such as:

- Billing Guide → Subscription Upgrades
- Payment Errors → PAYMENT_4027

## Main product capabilities

### 1. Grounded question answering

Users ask questions about the knowledge base. The application retrieves relevant passages and asks the LLM to answer only from that supplied context.

A good prompt should instruct the model to:

- Use only the retrieved context.
- Avoid inventing unsupported facts.
- Say that it does not know when the context does not contain the answer.
- Cite the sources used in the answer.

### 2. Document ingestion

Documents are not hardcoded. The system should accept formats such as PDF, Markdown, and plain text.

The ingestion pipeline is:

```text
Upload document
      ↓
Extract text
      ↓
Clean and normalize text
      ↓
Split text into chunks
      ↓
Generate an embedding for each chunk
      ↓
Store chunks, embeddings, and metadata
      ↓
ChromaDB collection
```

### 3. Metadata

Every stored chunk should retain useful metadata, for example:

```json
{
  "content": "PAYMENT_4027 occurs when...",
  "source": "payment-errors.md",
  "section": "Payment failures",
  "page": 18,
  "product": "billing",
  "version": "v2"
}
```

Metadata enables filtered retrieval, such as searching only billing documents for product version 2.

### 4. Retrieval visibility

SupportLens should show how it found an answer instead of displaying only the final LLM response.

For a query, it should be possible to inspect results such as:

```text
1. payment-errors.md    similarity: 0.91
2. billing.md           similarity: 0.84
3. upgrades.md          similarity: 0.79
4. refund-policy.md     similarity: 0.31
```

This makes it possible to distinguish between retrieval problems and answer-generation problems.

### 5. Hybrid retrieval

Vector search is useful for questions whose wording differs from the source material, but keyword search is often better for exact identifiers such as:

- `PAYMENT_4027`
- `ERR_AUTH_1003`
- Product names
- API field names

The system should eventually combine:

```text
Vector search ──┐
                ├── Hybrid candidate set
Keyword search ─┘
```

This allows semantic meaning and exact terms to contribute to retrieval.

### 6. Reranking

The initial retriever should retrieve a relatively broad candidate set. A reranker should then reorder those candidates and select the best few chunks for the LLM.

```text
Vector + keyword retrieval
            ↓
      Top 20 candidates
            ↓
         Reranker
            ↓
        Best 4–6 chunks
            ↓
            LLM
```

The system should compare retrieval quality with and without reranking rather than assuming that reranking helped.

### 7. Citations

Answers should show the documents, sections, and page numbers that support them. Citations are necessary for trust and for verifying whether the generated answer is grounded in the retrieved material.

### 8. “I don’t know” behaviour

If a question is unsupported by the knowledge base, SupportLens must not invent an answer.

When retrieval confidence is too low, it should respond with something similar to:

> No relevant information was found in the knowledge base.

The confidence threshold should eventually be evaluated rather than selected only by intuition.

## Planned application screens

### Chat

The main interface where a user asks questions and receives grounded answers with citations.

### Documents

A knowledge-base management screen showing uploaded documents, their ingestion status, and the number of chunks produced from each document. It should also provide document upload.

### Retrieval Debugger

A technical screen for inspecting retrieval behaviour. It should show:

- The query.
- Vector-search results and scores.
- Keyword-search results and scores.
- The combined candidate set.
- Reranked results.
- The chunks finally supplied to the LLM.

This screen is particularly important for learning, debugging, evaluation, and demonstrating the project in interviews.

## RAG concepts behind the project

### Embeddings

An embedding converts text into a vector: a list of numbers representing aspects of its meaning. Texts with similar meanings tend to have vectors that are close together even when they use different words.

The system generates embeddings for both stored chunks and user questions. Similarity calculations are then used to retrieve the chunks closest to the question.

### Chunking

Whole documents should not normally be represented by a single embedding because one document can contain many unrelated topics. Documents are split into smaller chunks, and each chunk receives its own embedding.

Chunking must avoid breaking related information into unusable fragments. The initial strategy should be recursive splitting that prefers meaningful boundaries:

```text
Paragraph
   ↓ if too large
Sentence
   ↓ if too large
Word
   ↓ if too large
Character
```

Chunk size and overlap are experimental parameters. They should be compared using the evaluation dataset instead of being treated as magic constants.

### Vector search and ChromaDB

ChromaDB stores documents, embeddings, and metadata in collections and retrieves records by vector similarity. It can generate embeddings through a collection's embedding function or accept vectors generated explicitly by the application.

The implementation should preserve a clear boundary between embedding generation and vector storage even when ChromaDB generates the first baseline embeddings automatically. This makes it possible to compare local and hosted embedding providers without rewriting document loading, chunking, retrieval evaluation, or answer generation.

Vectors produced by different embedding models must not be mixed. Changing the embedding model requires re-embedding the corpus and using a compatible collection configuration. Meaningful model comparisons should use the same chunks, metadata, questions, and retrieval metrics.

### Prompt construction

The final prompt consists of:

- Instructions defining grounded behaviour.
- The selected chunks and their source metadata.
- The user’s question.

More context is not automatically better. The system must control the number, size, ordering, and relevance of chunks placed in the model’s context window.

## Evaluation strategy

Evaluation is a core feature, not an optional final improvement.

The project should contain a golden dataset of roughly 40–50 questions. Each test case should identify the expected document or section and, where useful, an expected answer.

Example:

```text
Question:
What does PAYMENT_4027 mean?

Expected source:
payment-errors.md

Expected section:
Payment failures
```

Retrieval should be evaluated separately from answer generation. If the final answer is incorrect, the system should help determine whether:

1. The retriever failed to find the required information.
2. The retriever succeeded, but the LLM used the context incorrectly.

Useful retrieval metrics include:

- Recall@k
- Precision@k
- Mean Reciprocal Rank (MRR)

Answer evaluation should consider:

- Correctness
- Faithfulness to the supplied context
- Relevance
- Citation accuracy
- Unsupported or hallucinated claims

An LLM may be used as one evaluation signal, but it should not be treated as perfect ground truth.

Evaluation also enables regression testing. For example, if changing the chunk size causes Recall@5 to fall from 84% to 73%, the change should be rejected even if a few manually tested questions still look good.

## Development progression

The system should grow in explicit, measurable stages:

```text
V1  Basic vector RAG with ChromaDB
V2  Compare chunk sizes and overlap strategies
V3  Metadata filtering
V4  Hybrid keyword + vector retrieval
V5  Reranking
V6  Reliable citations and grounded fallback behaviour
V7  Golden dataset and evaluation metrics
V8  Automated regression testing
```

After the ChromaDB implementation is understood and evaluated, a managed vector database such as Pinecone may be compared as a separate exercise while preserving the rest of the RAG pipeline. This comparison is optional and has not yet been scheduled.

## Guiding principle

RAG is not simply “put documents in a vector database and call an LLM.” It is primarily a retrieval system whose output is consumed by an LLM.

The most important questions throughout the project are:

- Did we create useful chunks?
- Did retrieval find the correct information?
- Did irrelevant information enter the context?
- Did reranking improve the results?
- Is the answer supported by its cited sources?
- Can a change be shown to improve measured quality?

## Source material

- Shared ChatGPT conversation: <https://chatgpt.com/share/6a8494c5-7d68-83e9-a3cd-46fea301f672>
- Notion — RAG Fundamentals: <https://app.notion.com/p/3b7a5d3e0d408128ad15fed0a7a0e2c2?pvs=204>
- Notion — Software Engineer to AI Engineer roadmap: <https://app.notion.com/p/3b6a5d3e0d4081bc958bf968a76b4768?pvs=204>
