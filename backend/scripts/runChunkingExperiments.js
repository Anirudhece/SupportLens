import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config/environment.js';
import { createChromaClients } from '../src/clients/chromaClients.js';
import { createChromaRepository } from '../src/repositories/chromaRepository.js';
import { createLocalEmbeddingProvider } from '../src/embedding/localMiniLm.js';
import { chunkDocument } from '../src/chunking/chunkDocument.js';
import {
  calculateCaseMetrics,
  diagnoseDatasetSensitivity,
  median,
  selectBestExperiment,
  summarizeExperiment,
  validateExperimentStage
} from '../src/evals/chunkingExperimentMetrics.js';

const config = loadConfig();
const runId = randomUUID().replaceAll('-', '').slice(0, 12);
const corpusDirectories = [
  new URL('../fixtures/corpus/', import.meta.url),
  new URL('../fixtures/chunking/', import.meta.url)
];
const m1Cases = JSON.parse(await readFile(new URL('../evals/seed-cases.json', import.meta.url), 'utf8'));
const m2Cases = JSON.parse(await readFile(new URL('../evals/m2-chunking-cases.json', import.meta.url), 'utf8'));
const cases = [...m1Cases, ...m2Cases];

const stage1Configs = [100, 150, 200, 240].map((maxTokens) => ({
  name: `recursive-${maxTokens}-30`, strategy: 'recursive', maxTokens, overlapTokens: 30, stage: 1
}));

async function readCorpus() {
  const files = [];
  for (const directory of corpusDirectories) {
    for (const name of await readdir(directory)) {
      if (name.endsWith('.md') || name.endsWith('.txt')) files.push({ name, url: new URL(name, directory) });
    }
  }
  return Promise.all(files.sort((left, right) => left.name.localeCompare(right.name)).map(async (file) => ({
    name: file.name,
    text: await readFile(file.url, 'utf8')
  })));
}

function collectionName(configName) {
  return `m2exp_${runId}_${configName.replaceAll('_', '-').replaceAll('.', '-')}`.slice(0, 63);
}

async function seedCollection({ repository, embeddings, corpus, experiment }) {
  const started = performance.now();
  const rawChunks = corpus.flatMap((document) => chunkDocument(document.text, {
    strategy: experiment.strategy,
    maxTokens: experiment.maxTokens,
    overlapTokens: experiment.overlapTokens,
    tokenizer: embeddings.tokenizer,
    source: document.name
  }).map((chunk) => ({ ...chunk, source: document.name })));
  const vectors = await embeddings.embed(rawChunks.map((chunk) => chunk.content));
  await repository.addChunks('local', rawChunks.map((chunk, index) => ({
    id: `${experiment.name}:${index}`,
    content: chunk.content,
    embedding: vectors[index],
    metadata: { source: chunk.source, section: chunk.section || '' }
  })));
  return {
    ingestionLatencyMs: Math.round((performance.now() - started) * 100) / 100,
    chunkCount: rawChunks.length,
    tokenCounts: rawChunks.map((chunk) => chunk.tokenCount),
    layoutFingerprint: createHash('sha256')
      .update(rawChunks.map((chunk) => `${chunk.source}\u0000${chunk.section || ''}\u0000${chunk.content}`).join('\u0001'))
      .digest('hex')
  };
}

async function measureConfiguration({ clients, embeddings, queryVectors, corpus, experiment }) {
  const collection = collectionName(`s${experiment.stage}-${experiment.name}`);
  const repository = createChromaRepository({ clients, collectionNames: { local: collection } });
  try {
    const seeded = await seedCollection({ repository, embeddings, corpus, experiment });
    const rows = [];
    for (const [caseIndex, testCase] of cases.entries()) {
      const queryVector = queryVectors[caseIndex];
      // Query vectors are precomputed once for the whole run. Timing therefore
      // measures only the collection-dependent Chroma retrieval operation.
      await repository.query('local', queryVector, 5);
      const timed = [];
      let lastResults;
      for (let run = 0; run < 3; run += 1) {
        const started = performance.now();
        lastResults = await repository.query('local', queryVector, 5);
        timed.push(performance.now() - started);
      }
      const samples = timed.map((value) => Math.round(value * 100) / 100);
      const caseMedian = median(samples);
      rows.push(calculateCaseMetrics(testCase, lastResults, caseMedian, samples));
    }
    return {
      ...summarizeExperiment({ ...seeded, config: experiment, cases, rows }),
      timing: { warmupRunsPerCase: 1, timedRunsPerCase: 3 }
    };
  } finally {
    // This repository owns only the uniquely named collection above.
    await repository.deleteCollection('local');
  }
}

async function runConfigurations(clients, corpus, experiments, embeddings, queryVectors) {
  const summaries = [];
  for (const experiment of experiments) {
    try {
      summaries.push(await measureConfiguration({ clients, corpus, experiment, embeddings, queryVectors }));
    } catch (error) {
      summaries.push({ config: experiment, error: error.code || error.message || 'experiment_failed' });
      console.error(`${experiment.name}: failed (${error.code || error.message})`);
    }
  }
  validateExperimentStage(`Stage ${experiments[0]?.stage || 'unknown'}`, experiments, summaries);
  return summaries;
}

function validSummaries(summaries) {
  return summaries.filter((summary) => !summary.error);
}

function selectionRecord(stage, summaries, preferredName) {
  const valid = validSummaries(summaries);
  const selected = selectBestExperiment(valid, { preferredName });
  const sensitivity = diagnoseDatasetSensitivity(summaries);
  return {
    stage,
    candidates: valid.map((summary) => summary.config.name),
    selected: selected?.config.name || null,
    preferredControl: preferredName,
    rule: 'Lexicographic quality only: Recall@4, complete required-fact coverage@4, fact coverage ratio@4, MRR, exact-identifier Recall@1; prefer the named control on a quality tie; stable name otherwise. Latency and chunk count never select a winner.',
    sensitivity
  };
}

function printTable(summaries) {
  console.table(summaries.map((summary) => summary.error ? {
    config: summary.config.name, error: summary.error
  } : {
    config: summary.config.name,
    chunks: summary.chunkCount,
    avgTokens: Number(summary.averageChunkTokens?.toFixed(2)),
    recall1: summary.retrieval.recallAt1,
    recall3: summary.retrieval.recallAt3,
    recall4: summary.retrieval.recallAt4,
    recall5: summary.retrieval.recallAt5,
    mrr: summary.retrieval.mrr,
    exactId1: summary.retrieval.exactIdentifierRecallAt1,
    facts4: summary.retrieval.requiredFactCoverageAt4,
    complete4: summary.retrieval.requiredFactCompleteAt4,
    ingestMs: summary.ingestionLatencyMs,
    retrieveMedianMs: Number(summary.retrievalLatencyMedianMs?.toFixed(2)),
    retrieveMeanMs: Number(summary.retrievalLatencyMeanMs?.toFixed(2))
  }));
}

async function main() {
  const clients = createChromaClients(config);
  try {
    await clients.local.heartbeat();
  } catch (error) {
    throw new Error(`Local ChromaDB is unavailable at ${config.local.host}:${config.local.port}; start it with "npm run dev:chroma" before running the experiment (${error.code || error.message}).`);
  }

  const corpus = await readCorpus();
  const embeddings = createLocalEmbeddingProvider({ model: config.embedding.model });
  await embeddings.prepare();
  const questionEmbeddingStarted = performance.now();
  const queryVectors = await embeddings.embed(cases.map((testCase) => testCase.question));
  const questionEmbeddingLatencyMs = Math.round((performance.now() - questionEmbeddingStarted) * 100) / 100;
  const stage1 = await runConfigurations(clients, corpus, stage1Configs, embeddings, queryVectors);
  const stage1Winner = selectBestExperiment(validSummaries(stage1), { preferredName: 'recursive-200-30' });
  if (!stage1Winner) throw new Error('Stage 1 produced no successful configurations.');
  const stage2Configs = [0, 15, 30, 45].map((overlapTokens) => ({
    name: `recursive-${stage1Winner.config.maxTokens}-${overlapTokens}`,
    strategy: 'recursive', maxTokens: stage1Winner.config.maxTokens, overlapTokens, stage: 2
  }));
  const stage2 = await runConfigurations(clients, corpus, stage2Configs, embeddings, queryVectors);
  const stage2Control = `recursive-${stage1Winner.config.maxTokens}-30`;
  const stage2Winner = selectBestExperiment(validSummaries(stage2), { preferredName: stage2Control });
  if (!stage2Winner) throw new Error('Stage 2 produced no successful configurations.');
  const stage3Configs = [
    { ...stage2Winner.config, name: `recursive-${stage2Winner.config.maxTokens}-${stage2Winner.config.overlapTokens}`, stage: 3 },
    { ...stage2Winner.config, name: `heading-aware-${stage2Winner.config.maxTokens}-${stage2Winner.config.overlapTokens}`, strategy: 'heading-aware', stage: 3 }
  ];
  const stage3 = await runConfigurations(clients, corpus, stage3Configs, embeddings, queryVectors);
  const stage3Control = `recursive-${stage2Winner.config.maxTokens}-${stage2Winner.config.overlapTokens}`;
  const stage3Winner = selectBestExperiment(validSummaries(stage3), { preferredName: stage3Control });
  const summaries = [...stage1, ...stage2, ...stage3];
  const output = {
    runId,
    target: 'local',
    corpus: corpus.map((document) => document.name),
    caseCount: cases.length,
    timing: {
      questionEmbeddingLatencyMs,
      questionEmbedding: 'One shared MiniLM batch for all fixed questions; excluded from configuration selection.',
      retrieval: 'Direct repository.query(local, fixedVector, 5); one warmup plus three timed samples per case.'
    },
    selections: [
      selectionRecord(1, stage1, 'recursive-200-30'),
      selectionRecord(2, stage2, stage2Control),
      selectionRecord(3, stage3, stage3Control)
    ],
    recommendation: stage3Winner?.config.name || null,
    summaries
  };
  const outputPath = process.env.M2_EXPERIMENT_OUTPUT || path.resolve('.local/evals', `m2-chunking-${runId}.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  printTable(summaries);
  for (const selection of output.selections) {
    const diagnostic = selection.sensitivity;
    console.log(`Stage ${selection.stage} sensitivity: ${diagnostic.distinctLayouts} distinct layouts, ${diagnostic.distinctChunkCounts.length} distinct chunk counts, fact coverage varies=${diagnostic.factCoverageVaries}.`);
    if (diagnostic.warning) console.warn(`WARNING: ${diagnostic.warning}`);
  }
  console.log(`Machine-readable results: ${outputPath}`);
  console.log(`Recommendation (pending user decision checkpoint): ${output.recommendation || 'none'}`);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
