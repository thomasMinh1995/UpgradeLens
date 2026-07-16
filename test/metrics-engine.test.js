import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  buildEvaluationReport,
  buildMetrics,
  metricsDigest,
  serializeMetrics,
  validateMetrics,
  writeMetrics
} from '../src/index.js';

const metricsSchema = JSON.parse(await readFile(new URL('../schemas/metrics.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(metricsSchema);

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

test('metrics engine builds schema-valid deterministic metrics from an Evaluation Report', () => {
  const failed = caseResult({
    id: 'node/react-failed',
    passed: false,
    checks: {
      ...caseResult().checks,
      riskLevel: check(false, 'high', 'low'),
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

  assert.equal(validateSchema(metrics), true, JSON.stringify(validateSchema.errors, null, 2));
  assert.equal(validateMetrics(metrics), metrics);
  assert.equal(metrics.summary.totalCases, 2);
  assert.equal(metrics.metrics.riskClassificationAccuracy.value, 0.5);
  assert.equal(metrics.metrics.humanReviewAccuracy.value, 1);
  assert.equal(metrics.metrics.evidenceReferenceAccuracy.value, 0.5);
  assert.equal(metrics.metrics.evidenceReferenceCoverage.matchedReferenceCount, 2);
  assert.equal(metrics.metrics.evidenceReferenceCoverage.expectedReferenceCount, 3);
  assert.equal(metrics.metrics.unsupportedClaimRate.unsupportedClaimCount, 1);
  assert.equal(metrics.metrics.unsupportedClaimRate.denominator, 3);
  assert.equal(metrics.metrics.validationPassRate.value, 0.5);
  assert.equal(metrics.metrics.deterministicPassRate.value, 0.5);
  assert.match(metricsDigest(metrics), /^sha256:[a-f0-9]{64}$/);
});

test('metrics validation rejects unsupported schema versions', () => {
  const metrics = buildMetrics(report());
  metrics.schemaVersion = '9.0.0';

  assert.throws(() => validateMetrics(metrics), /unsupported schema version/);
});

test('metrics writer serializes pretty JSON atomically', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-metrics-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const metrics = buildMetrics(report(), { generatedAt: '2026-07-15T01:00:00.000Z' });
  const output = path.join(root, 'reports', 'metrics.json');

  await mkdir(path.dirname(output), { recursive: true });
  const target = await writeMetrics(output, metrics);
  const contents = await readFile(target, 'utf8');

  assert.equal(target, output);
  assert.equal(contents, serializeMetrics(metrics));
  assert.ok(contents.endsWith('\n'));
});
