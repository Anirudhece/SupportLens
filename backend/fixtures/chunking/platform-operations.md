# Approved runtime dependencies

The SupportLens backend runs on Node.js 24 and uses the following approved runtime packages. Versions are pinned so that experiment results and deployment builds can be reproduced.

- `@chroma-core/default-embed@0.1.9`
- `@huggingface/transformers@3.8.1`
- `@google/genai@2.19.0`
- `chromadb@3.5.0`
- `express@5.2.1`
- `zod@4.5.4`

The frontend is a separate Next.js workspace and does not add a backend runtime dependency. The API boundary is browser to Express, and the frontend calls named functions in its `apiHandlers` directory.

## Dependency upgrades

Dependency changes require a lockfile update, a clean install, the deterministic unit suite, and the production build. A package may be upgraded only after its license, Node.js compatibility, and security status have been checked.

## Embedding service

The local embedding provider generates vectors with `Xenova/all-MiniLM-L6-v2` before ChromaDB storage. The embedding model is downloaded to the application machine once and is also used when the selected storage target is Chroma Cloud. Chroma stores vectors; it is not responsible for choosing the answer model.

## Retrieval configuration

Production retrieval returns four chunks to the answer prompt. Experiment runs may retrieve five chunks to calculate Recall@5, but they must evaluate required-fact coverage separately within the first four chunks. Increasing experiment candidate depth must not silently change the production setting.

## Deployment checklist

Before deployment, verify that credentials are supplied through environment variables, uploads contain no confidential data when using free-tier generation, and Local and Cloud collections are never mixed. Record the selected embedding model and chunking configuration with the release.

## Reproducible dependency review

The dependency review records the package name, exact version, reason for inclusion, and the workspace that imports it. Reviewers compare the lockfile with the manifest and keep the package manager output attached to the change. A runtime package used by the backend is not automatically approved for the frontend, and a frontend package is not automatically available to an Express handler. This distinction matters when reproducing a deployment from a clean checkout because workspace boundaries determine which installation scripts and transitive packages are present.

The review also records the Node.js version, operating-system architecture, embedding model identifier, and Chroma collection name used by the experiment. A result without these details is not considered reproducible evidence. If a package has a native component, the reviewer checks whether the same component can be installed on the supported development machine and in the eventual deployment image. The review does not replace the test suite: dependency changes must still pass ingestion, retrieval, answer-schema, and frontend build checks.

When support engineers investigate a retrieval result, they should be able to distinguish storage configuration from model configuration. The storage target can be Local or Chroma Cloud, while the embedding model remains the approved local MiniLM provider in both cases. A collection created for a chunking experiment is temporary and must never be used by the normal chat path. The experiment report therefore names each temporary collection, records its chunk layout, and confirms cleanup after the metrics are written.

For a reproducibility review, an engineer follows the complete path from source checkout to retrieval result instead of comparing only package manifests. The engineer records the Node.js runtime, operating-system architecture, workspace command, lockfile revision, embedding model identifier, tokenizer revision, Chroma server version, collection name, distance function, chunk strategy, maximum token count, overlap, retrieval depth, and case-file revision. The source document is normalized before chunking, and the normalized text is retained so a reviewer can distinguish an embedding difference from a source-loss bug. Each chunk keeps its source and section metadata, while experiment collections use names that cannot collide with the normal Local or Cloud collections. The same questions are submitted to every candidate, and the candidate depth is large enough to calculate Recall@5 while the answer contract still evaluates only the first four chunks. A warm-up request is separated from three timed requests because model loading, connection setup, and Chroma query time have different operational meanings. Median latency is reported alongside the individual samples so one suspended process or network pause cannot choose a chunk configuration. A report that shows identical layouts and identical quality metrics is a dataset warning, not proof that all chunkers are equivalent in production. The next experiment should add a case whose required facts cross a real chunk boundary while retaining the same synthetic support domain. When an experiment is complete, the runner deletes only collections whose names it created during that run and writes the measured result before exiting. This evidence allows an interviewer or maintainer to reproduce the claim without depending on an undocumented machine-local state or an accidentally reused production collection.
