import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadGoldenDataset,
  runEvaluation,
  serializeEvaluationReport,
  validateEvaluationReport,
  writeEvaluationReport
} from '../src/index.js';
import { runCli } from '../src/cli.js';

const passCasePath = 'eval/datasets/node/axios-patch-low.json';

function capture() {
  let value = '';
  return { stream: { write(chunk) { value += chunk; } }, value: () => value };
}

test('evaluation runner loads and validates a Golden Dataset file', async () => {
  const dataset = await loadGoldenDataset(passCasePath);

  assert.equal(dataset.cases.length, 1);
  assert.equal(dataset.cases[0].id, 'node/axios-patch-low');
  assert.equal(dataset.datasetVersion, '1.0.0');
});

test('evaluation runner generates a schema-valid pass report with fake runtime', async () => {
  const report = await runEvaluation({
    datasetPath: passCasePath,
    generatedAt: '2026-07-15T00:00:00.000Z'
  });

  assert.equal(report.summary.totalCases, 1);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.metrics.riskClassificationAccuracy, 1);
  assert.equal(report.metrics.humanReviewAccuracy, 1);
  assert.equal(report.metrics.evidenceReferenceAccuracy, 1);
  assert.equal(report.metrics.schemaValidationPassRate, 1);
  assert.equal(validateEvaluationReport(report), report);
});

test('evaluation runner reports fail cases without throwing', async () => {
  const runtime = {
    async generateStructured(request) {
      const evidenceId = request.context.metadata.selectedEvidenceIds[0];
      return {
        output: {
          summary: 'Wrong risk output.',
          summaryEvidenceRefs: [evidenceId],
          riskLevel: 'high',
          riskEvidenceRefs: [evidenceId],
          findings: []
        },
        provider: 'fake',
        model: 'fake',
        latencyMs: 0
      };
    }
  };
  const report = await runEvaluation({
    datasetPath: passCasePath,
    runtime,
    generatedAt: '2026-07-15T00:00:00.000Z'
  });

  assert.equal(report.summary.passed, 0);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.cases[0].checks.riskLevel.passed, false);
});

test('evaluation runner validates invalid dataset and invalid expected result before runtime', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-eval-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'cases'), { recursive: true });
  await writeFile(path.join(root, 'cases', 'invalid-dataset.json'), JSON.stringify({
    schemaVersion: '1.0.0',
    id: 'invalid/dataset'
  }));
  await assert.rejects(loadGoldenDataset(path.join(root, 'cases')), /failed schema validation/);

  const valid = JSON.parse(await readFile(passCasePath, 'utf8'));
  delete valid.expectedResult.riskLevel;
  await writeFile(path.join(root, 'cases', 'invalid-expected.json'), JSON.stringify(valid));
  await assert.rejects(loadGoldenDataset(path.join(root, 'cases', 'invalid-expected.json')), /failed schema validation/);
});

test('evaluation report writer writes pretty JSON', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-eval-report-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await runEvaluation({
    datasetPath: passCasePath,
    generatedAt: '2026-07-15T00:00:00.000Z'
  });
  const output = path.join(root, 'evaluation-report.json');
  const target = await writeEvaluationReport(output, report);
  const contents = await readFile(target, 'utf8');

  assert.equal(target, output);
  assert.equal(contents, serializeEvaluationReport(report));
  assert.equal(JSON.parse(contents).schemaVersion, '1.0.0');
});

test('CLI eval supports stdout and output path', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-eval-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stdout = capture();
  const stderr = capture();
  const code = await runCli(['eval', '--dataset', passCasePath, '--stdout'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    clock: () => new Date('2026-07-15T00:00:00.000Z')
  });

  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout.value()).summary.passed, 1);
  assert.equal(stderr.value(), '');

  let writtenReport;
  const writeCode = await runCli(['eval', passCasePath, '--output', 'reports/evaluation-report.json'], {
    stdout: capture().stream,
    stderr: capture().stream,
    clock: () => new Date('2026-07-15T00:00:00.000Z'),
    writeEvaluationReport: async (target, report) => {
      writtenReport = { target, report };
      return target;
    }
  });
  assert.equal(writeCode, 0);
  assert.equal(writtenReport.report.summary.passed, 1);
  assert.ok(writtenReport.target.endsWith(path.join('reports', 'evaluation-report.json')));
});
