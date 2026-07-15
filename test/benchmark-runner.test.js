import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  buildBenchmarkReport,
  loadBenchmarkConfig,
  runBenchmark,
  serializeBenchmarkReport,
  validateBenchmarkConfig,
  validateBenchmarkReport,
  writeBenchmarkReport
} from '../src/index.js';
import { runCli } from '../src/cli.js';

const benchmarkSchema = JSON.parse(await readFile(new URL('../schemas/benchmark.schema.json', import.meta.url), 'utf8'));
const reportSchema = JSON.parse(await readFile(new URL('../schemas/benchmark-report.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateBenchmarkSchema = ajv.compile(benchmarkSchema);
const validateReportSchema = ajv.compile(reportSchema);

function digest(seed) {
  return `sha256:${createHash('sha256').update(seed).digest('hex')}`;
}

function capture() {
  let value = '';
  return { stream: { write(chunk) { value += chunk; } }, value: () => value };
}

function highRiskCase() {
  const evidenceId = digest('benchmark-evidence');
  const content = 'Version 2.0.0 removes the legacy API and requires migration.';
  return {
    schemaVersion: '1.0.0',
    id: 'node/react-major',
    title: 'React major benchmark fixture',
    category: 'high-risk',
    repository: {
      name: 'benchmark-fixture',
      fixturePath: 'fixtures/node/react-major',
      ecosystem: 'node',
      packageManager: 'npm',
      languages: ['JavaScript']
    },
    dependency: {
      packageId: 'npm:react',
      declaredName: 'react',
      normalizedName: 'react',
      ecosystem: 'node',
      registry: 'npm',
      dependencyType: 'dependency',
      manifest: 'package.json'
    },
    versions: {
      analysisMode: 'exactBaseline',
      declaredVersion: '1.0.0',
      currentVersion: '1.0.0',
      targetVersion: '2.0.0',
      targetPolicy: 'explicit',
      delta: { direction: 'upgrade', classification: 'major' }
    },
    selectedEvidence: [
      {
        id: evidenceId,
        kind: 'breakingChanges',
        sourceId: 'npm:react:docs',
        sourceUrl: 'https://example.com/react/2.0.0',
        authority: 'officialProject',
        trust: 'official',
        contentDigest: digest(content),
        locator: 'heading:breaking',
        releaseVersions: ['2.0.0'],
        content
      }
    ],
    expectedResult: {
      riskLevel: 'high',
      requiresHumanReview: true,
      humanReviewReasons: ['HIGH_RISK'],
      evidenceCoverage: 'sufficient',
      validation: { status: 'valid', warningCodes: [] },
      expectedEvidenceRefs: {
        summary: [evidenceId],
        risk: [evidenceId],
        findings: [evidenceId]
      },
      expectedFindings: [
        {
          kind: 'breakingChange',
          appliesToVersions: ['2.0.0'],
          evidenceRefs: [evidenceId],
          requiredKeywords: ['removes', 'migration']
        }
      ]
    }
  };
}

async function writeDataset(root) {
  const dataset = path.join(root, 'datasets');
  await mkdir(dataset, { recursive: true });
  await writeFile(path.join(dataset, 'case.json'), JSON.stringify(highRiskCase(), null, 2));
  return dataset;
}

function config(datasetPath, runs = [
  {
    id: 'prompt-v1-local',
    promptVersion: 'v1',
    model: { provider: 'local', name: 'fixture-good' },
    runtime: { type: 'fake-good' }
  }
]) {
  return {
    schemaVersion: '1.0.0',
    name: 'fixture benchmark',
    datasetPath,
    runs
  };
}

function fakeRuntime({ riskLevel = 'high', latencyMs = null, tokenUsage = null, estimatedCost = null } = {}) {
  return {
    async generateStructured(request) {
      const evidenceId = request.context.metadata.selectedEvidenceIds[0];
      return {
        output: {
          summary: 'Version 2.0.0 removes legacy API and requires migration.',
          summaryEvidenceRefs: [evidenceId],
          riskLevel,
          riskEvidenceRefs: [evidenceId],
          findings: riskLevel === 'high'
            ? [
                {
                  id: 'finding-1',
                  kind: 'breakingChange',
                  summary: 'The release removes legacy API and requires migration.',
                  appliesToVersions: ['2.0.0'],
                  evidenceRefs: [evidenceId]
                }
              ]
            : []
        },
        provider: 'fake',
        model: riskLevel,
        ...(latencyMs === null ? {} : { latencyMs }),
        ...(tokenUsage === null ? {} : { tokenUsage }),
        ...(estimatedCost === null ? {} : { estimatedCost })
      };
    }
  };
}

test('benchmark config schema validates and rejects duplicate run ids', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-benchmark-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const datasetPath = await writeDataset(root);
  const value = config(datasetPath);
  const configPath = path.join(root, 'benchmark.json');
  await writeFile(configPath, JSON.stringify(value));

  assert.equal(validateBenchmarkSchema(value), true, JSON.stringify(validateBenchmarkSchema.errors, null, 2));
  assert.deepEqual(await loadBenchmarkConfig(configPath), value);

  const duplicate = config(datasetPath, [value.runs[0], value.runs[0]]);
  assert.throws(() => validateBenchmarkConfig(duplicate), /duplicate run id/);
});

test('benchmark runner compares multiple prompts and models with deterministic ranking and performance', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-benchmark-runner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const datasetPath = await writeDataset(root);
  const report = await runBenchmark(config(datasetPath, [
    {
      id: 'prompt-v1-good',
      promptVersion: 'v1',
      model: { provider: 'local', name: 'fixture-good' },
      runtime: { type: 'fake-good' }
    },
    {
      id: 'prompt-v2-bad',
      promptVersion: 'v2-experimental',
      model: { provider: 'local', name: 'fixture-bad' },
      runtime: { type: 'fake-bad' }
    },
    {
      id: 'prompt-v1-golden',
      promptVersion: 'v1',
      model: { provider: 'golden', name: 'golden-fake' },
      runtime: { type: 'goldenFake' }
    }
  ]), {
    configPath: path.join(root, 'benchmark.json'),
    generatedAt: '2026-07-15T03:00:00.000Z',
    runtimeFactory: async (run) => {
      if (run.runtime.type === 'fake-good') return fakeRuntime({ riskLevel: 'high', latencyMs: 50, tokenUsage: 100, estimatedCost: 0.01 });
      if (run.runtime.type === 'fake-bad') return fakeRuntime({ riskLevel: 'low', latencyMs: 10 });
      return null;
    }
  });

  assert.equal(validateReportSchema(report), true, JSON.stringify(validateReportSchema.errors, null, 2));
  assert.equal(validateBenchmarkReport(report), report);
  assert.deepEqual(report.runs.map((run) => run.id), ['prompt-v1-golden', 'prompt-v1-good', 'prompt-v2-bad']);
  assert.equal(report.ranking[0].runId, 'prompt-v1-good');
  assert.equal(report.ranking[1].runId, 'prompt-v1-golden');
  assert.equal(report.ranking.at(-1).runId, 'prompt-v2-bad');
  assert.equal(report.runs.find((run) => run.id === 'prompt-v1-good').performance.latencyMs, 50);
  assert.equal(report.runs.find((run) => run.id === 'prompt-v1-good').performance.tokenUsage, 100);
  assert.equal(report.runs.find((run) => run.id === 'prompt-v1-good').performance.estimatedCost, 0.01);
  assert.deepEqual(report.runs.find((run) => run.id === 'prompt-v1-golden').performance, {
    latencyMs: null,
    tokenUsage: null,
    estimatedCost: null
  });
});

test('benchmark report builder ranks by score, risk, evidence quality, latency, cost, then id', () => {
  const run = (id, overallScore, riskAccuracy, evidenceQuality, latencyMs, estimatedCost) => ({
    id,
    promptVersion: 'v1',
    model: { provider: 'fixture', name: id },
    runtime: { type: 'fixture' },
    datasetPath: '/tmp/dataset',
    evaluation: { totalCases: 1, passed: 1, failed: 0 },
    metrics: {
      overallScore,
      riskAccuracy,
      humanReviewAccuracy: 1,
      evidenceQuality,
      unsupportedClaimRate: 0,
      deterministicPassRate: 1
    },
    scorecard: {
      overallScore,
      categoryScores: {
        riskAnalysis: Math.round(riskAccuracy * 100),
        humanReview: 100,
        evidenceQuality,
        trustLayer: 100,
        deterministicQuality: 100
      },
      recommendationCodes: []
    },
    performance: { latencyMs, tokenUsage: null, estimatedCost }
  });
  const report = buildBenchmarkReport({
    benchmark: { name: 'ranking', configPath: null, datasetPath: '/tmp/dataset' },
    generatedAt: '2026-07-15T03:00:00.000Z',
    runs: [
      run('costly', 90, 0.9, 90, 10, 2),
      run('cheap', 90, 0.9, 90, 10, 1),
      run('slow', 90, 0.9, 90, 20, 0),
      run('better-risk', 90, 1, 80, 50, 0),
      run('best-score', 95, 0.8, 80, null, null)
    ]
  });

  assert.deepEqual(report.ranking.map((entry) => entry.runId), [
    'best-score',
    'better-risk',
    'cheap',
    'costly',
    'slow'
  ]);
});

test('benchmark writer and CLI produce benchmark-report.json without a real model', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-benchmark-cli-'));
  const previousCwd = process.cwd();
  t.after(() => {
    process.chdir(previousCwd);
    return rm(root, { recursive: true, force: true });
  });
  const datasetPath = await writeDataset(root);
  const benchmarkConfig = config(datasetPath, [
    {
      id: 'prompt-v1-golden',
      promptVersion: 'v1',
      model: { provider: 'golden', name: 'golden-fake' },
      runtime: { type: 'goldenFake' }
    }
  ]);
  const configPath = path.join(root, 'benchmark.json');
  await writeFile(configPath, JSON.stringify(benchmarkConfig, null, 2));
  process.chdir(root);

  const stdout = capture();
  const stdoutCode = await runCli(['benchmark', '--stdout'], {
    stdout: stdout.stream,
    stderr: capture().stream,
    clock: () => new Date('2026-07-15T03:00:00.000Z')
  });
  assert.equal(stdoutCode, 0);
  assert.equal(JSON.parse(stdout.value()).ranking[0].runId, 'prompt-v1-golden');

  const stderr = capture();
  const writeCode = await runCli(['benchmark', '--config', 'benchmark.json', '--output', 'artifacts/benchmark-report.json'], {
    stdout: capture().stream,
    stderr: stderr.stream,
    clock: () => new Date('2026-07-15T03:00:00.000Z')
  });
  const written = JSON.parse(await readFile(path.join(root, 'artifacts', 'benchmark-report.json'), 'utf8'));
  const manualTarget = await writeBenchmarkReport(path.join(root, 'manual-report.json'), written);

  assert.equal(writeCode, 0);
  assert.equal(written.schemaVersion, '1.0.0');
  assert.equal(written.ranking[0].runId, 'prompt-v1-golden');
  assert.match(stderr.value(), /Top run: prompt-v1-golden/);
  assert.equal(await readFile(manualTarget, 'utf8'), serializeBenchmarkReport(written));
});
