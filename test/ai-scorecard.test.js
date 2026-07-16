import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  buildAiScorecard,
  buildEvaluationReport,
  buildMetrics,
  serializeAiScorecard,
  serializeEvaluationReport,
  validateAiScorecard,
  writeAiScorecard
} from '../src/index.js';
import { runCli } from '../src/cli.js';

const scorecardSchema = JSON.parse(await readFile(new URL('../schemas/ai-scorecard.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(scorecardSchema);

function capture() {
  let value = '';
  return { stream: { write(chunk) { value += chunk; } }, value: () => value };
}

function check(passed, expected, actual) {
  return { passed, expected, actual };
}

function caseResult(overrides = {}) {
  return {
    id: 'node/react-major',
    title: 'React major',
    category: 'high-risk',
    ecosystem: 'node',
    passed: true,
    checks: {
      schema: check(true, true, true),
      summaryPresent: check(true, true, true),
      riskLevel: check(true, 'high', 'high'),
      humanReview: check(true, true, true),
      humanReviewReasons: check(true, ['HIGH_RISK'], ['HIGH_RISK']),
      evidenceCoverage: check(true, 'sufficient', 'sufficient'),
      validationState: check(true, { status: 'valid', warningCodes: [] }, { status: 'valid', warningCodes: [] }),
      evidenceReferences: check(
        true,
        { summary: ['e1'], risk: ['e1'], findings: ['e1'] },
        { summary: ['e1'], risk: ['e1'], findings: ['e1'] }
      ),
      findings: check(
        true,
        [{ kind: 'breakingChange', appliesToVersions: ['2.0.0'], evidenceRefs: ['e1'] }],
        [{ kind: 'breakingChange', appliesToVersions: ['2.0.0'], evidenceRefs: ['e1'] }]
      )
    },
    actual: {
      status: 'analyzed',
      riskLevel: 'high',
      requiresHumanReview: true,
      evidenceCoverage: 'sufficient',
      validationStatus: 'valid'
    },
    ...overrides
  };
}

function report(cases = [caseResult()]) {
  return buildEvaluationReport({
    datasetPath: '/tmp/golden',
    datasetVersion: '1.0.0',
    promptVersion: '1',
    model: { provider: 'fake', name: 'fake' },
    caseResults: cases,
    generatedAt: '2026-07-15T00:00:00.000Z'
  });
}

test('AI scorecard builds schema-valid category scores and deterministic recommendations', () => {
  const failed = caseResult({
    id: 'node/react-failed',
    passed: false,
    checks: {
      ...caseResult().checks,
      riskLevel: check(false, 'high', 'low'),
      humanReview: check(false, true, false),
      humanReviewReasons: check(false, ['HIGH_RISK'], []),
      evidenceReferences: check(
        false,
        { summary: ['e1', 'e2'], risk: ['e1'], findings: ['e2'] },
        { summary: ['e1'], risk: [], findings: [] }
      ),
      validationState: check(
        false,
        { status: 'valid', warningCodes: [] },
        { status: 'validWithWarnings', warningCodes: ['CLAIMS_DROPPED'] }
      )
    }
  });
  const metrics = buildMetrics(report([caseResult(), failed]), {
    generatedAt: '2026-07-15T01:00:00.000Z'
  });
  const scorecard = buildAiScorecard(metrics, {
    generatedAt: '2026-07-15T02:00:00.000Z'
  });

  assert.equal(validateSchema(scorecard), true, JSON.stringify(validateSchema.errors, null, 2));
  assert.equal(validateAiScorecard(scorecard), scorecard);
  assert.equal(scorecard.categoryScores.riskAnalysis, 50);
  assert.equal(scorecard.categoryScores.humanReview, 50);
  assert.equal(scorecard.categoryScores.deterministicQuality, 50);
  assert.ok(scorecard.overallScore < 100);
  assert.ok(scorecard.recommendations.some((item) => item.code === 'RISK_CLASSIFICATION_LOW'));
  assert.ok(scorecard.recommendations.some((item) => item.code === 'UNSUPPORTED_CLAIMS_DETECTED'));
});

test('AI scorecard emits ready recommendation for high-quality metrics', () => {
  const metrics = buildMetrics(report(), {
    generatedAt: '2026-07-15T01:00:00.000Z'
  });
  const scorecard = buildAiScorecard(metrics, {
    generatedAt: '2026-07-15T02:00:00.000Z'
  });

  assert.equal(scorecard.overallScore, 100);
  assert.deepEqual(scorecard.recommendations.map((item) => item.code), ['READY_FOR_BENCHMARK']);
});

test('scorecard writer serializes pretty JSON atomically', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-scorecard-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const metrics = buildMetrics(report(), { generatedAt: '2026-07-15T01:00:00.000Z' });
  const scorecard = buildAiScorecard(metrics, { generatedAt: '2026-07-15T02:00:00.000Z' });
  const output = path.join(root, 'reports', 'ai-scorecard.json');

  const target = await writeAiScorecard(output, scorecard);
  const contents = await readFile(target, 'utf8');

  assert.equal(target, output);
  assert.equal(contents, serializeAiScorecard(scorecard));
  assert.ok(contents.endsWith('\n'));
});

test('CLI scorecard supports stdout and writes metrics plus scorecard artifacts', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-scorecard-cli-'));
  const previousCwd = process.cwd();
  t.after(() => {
    process.chdir(previousCwd);
    return rm(root, { recursive: true, force: true });
  });
  const evaluationReport = report();
  await writeFile(path.join(root, 'evaluation-report.json'), serializeEvaluationReport(evaluationReport));
  process.chdir(root);

  const stdout = capture();
  const stdoutCode = await runCli(['scorecard', '--stdout'], {
    stdout: stdout.stream,
    stderr: capture().stream,
    clock: () => new Date('2026-07-15T02:00:00.000Z')
  });
  assert.equal(stdoutCode, 0);
  assert.equal(JSON.parse(stdout.value()).overallScore, 100);

  const stderr = capture();
  const writeCode = await runCli([
    'scorecard',
    'evaluation-report.json',
    '--metrics-output',
    'artifacts/metrics.json',
    '--output',
    'artifacts/ai-scorecard.json'
  ], {
    stdout: capture().stream,
    stderr: stderr.stream,
    clock: () => new Date('2026-07-15T02:00:00.000Z')
  });

  assert.equal(writeCode, 0);
  assert.equal(JSON.parse(await readFile(path.join(root, 'artifacts', 'metrics.json'), 'utf8')).schemaVersion, '1.0.0');
  assert.equal(JSON.parse(await readFile(path.join(root, 'artifacts', 'ai-scorecard.json'), 'utf8')).overallScore, 100);
  assert.match(stderr.value(), /Scorecard: 100\/100/);
});
