import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCli } from '../src/cli.js';
import {
  buildConformanceReport,
  conformanceReportDigest,
  serializeConformanceReport,
  validateConformanceReport,
  writeConformanceReport
} from '../src/conformance-report.js';
import {
  capabilityProfileDigest,
  createDefaultGovernanceArtifacts,
  deploymentProfileDigest
} from '../src/governance-metadata.js';
import {
  createOfflineConformanceExecutor,
  runConformance
} from '../src/conformance-runner.js';
import {
  RUNTIME_CONFORMANCE_CASES,
  validateRuntimeConformanceOutput
} from '../src/runtime-conformance.js';

const FIXED_TIME = '2026-07-15T00:00:00.000Z';
const runtime = { provider: 'openai-compatible', model: 'offline-fixture' };
const byId = new Map(RUNTIME_CONFORMANCE_CASES.map((entry) => [entry.id, entry]));
const governance = createDefaultGovernanceArtifacts(runtime);
const reportReferences = {
  capabilityProfileDigest: capabilityProfileDigest(governance.capabilityProfile),
  deploymentProfileDigest: deploymentProfileDigest(governance.deploymentProfile)
};

function capture() {
  let value = '';
  return {
    stream: { write(chunk) { value += chunk; } },
    value() { return value; }
  };
}

test('offline suite covers the complete protocol behavior catalog', () => {
  const expectedIds = [
    'connectivity-reachable',
    'connectivity-unreachable',
    'authentication-none',
    'authentication-bearer',
    'authentication-invalid',
    'timeout-classification',
    'cancellation-propagation',
    'structured-output-json-schema',
    'json-mode-capability',
    'response-empty-content',
    'response-multiple-choices',
    'response-missing-choices',
    'response-malformed-json',
    'response-invalid-output-schema',
    'usage-mapping',
    'identity-match',
    'identity-mismatch',
    'content-type-invalid',
    'response-oversized',
    'redirect-rejected',
    'structured-output-unsupported',
    'provider-error-classification',
    'unknown-error-classification',
    ...[401, 403, 404, 408, 409, 422, 429, 500, 502, 503, 504].map((status) => `http-${status}`)
  ];

  assert.deepEqual([...byId.keys()].sort(), expectedIds.sort());
  assert.equal(new Set(byId.keys()).size, RUNTIME_CONFORMANCE_CASES.length);
});

test('conformance output validator accepts only the fixed schema', () => {
  assert.deepEqual(
    validateRuntimeConformanceOutput('{"status":"ok","protocol":"chat-completions"}'),
    { status: 'ok', protocol: 'chat-completions' }
  );
  assert.throws(
    () => validateRuntimeConformanceOutput('{"status":"invented","protocol":"chat-completions"}'),
    (error) => error.code === 'INVALID_OUTPUT_SCHEMA'
  );
  assert.throws(
    () => validateRuntimeConformanceOutput('{broken'),
    (error) => error.code === 'INVALID_OUTPUT_JSON'
  );
});

test('executor observes each expected protocol outcome through the provider', async (t) => {
  const executor = createOfflineConformanceExecutor();
  for (const caseDefinition of RUNTIME_CONFORMANCE_CASES) {
    await t.test(caseDefinition.id, async () => {
      const result = await executor(caseDefinition, runtime);
      assert.ok(caseDefinition.accepted.includes(result.outcome), `${result.outcome} is not accepted`);
    });
  }
});

test('required acceptance cases are represented by explicit outcomes', async () => {
  const executor = createOfflineConformanceExecutor();
  const expectations = new Map([
    ['connectivity-reachable', 'SUCCESS'],
    ['connectivity-unreachable', 'NETWORK_ERROR'],
    ['http-401', 'AUTH_ERROR'],
    ['http-403', 'AUTH_ERROR'],
    ['http-404', 'MODEL_NOT_FOUND'],
    ['http-429', 'RATE_LIMITED'],
    ['http-500', 'PROVIDER_ERROR'],
    ['timeout-classification', 'TIMEOUT'],
    ['cancellation-propagation', 'CANCELLED'],
    ['response-malformed-json', 'INVALID_RESPONSE'],
    ['response-invalid-output-schema', 'INVALID_OUTPUT_SCHEMA'],
    ['content-type-invalid', 'INVALID_RESPONSE'],
    ['response-multiple-choices', 'INVALID_RESPONSE'],
    ['response-missing-choices', 'INVALID_RESPONSE'],
    ['identity-mismatch', 'IDENTITY_MISMATCH'],
    ['response-oversized', 'RESPONSE_TOO_LARGE'],
    ['redirect-rejected', 'NETWORK_ERROR'],
    ['structured-output-unsupported', 'STRUCTURED_OUTPUT_UNSUPPORTED']
  ]);
  for (const [id, expected] of expectations) {
    assert.equal((await executor(byId.get(id), runtime)).outcome, expected, id);
  }
});

test('complete offline run produces a conformant, schema-valid report', async () => {
  const report = await runConformance({ runtime, generatedAt: FIXED_TIME });

  assert.equal(report.summary.total, RUNTIME_CONFORMANCE_CASES.length);
  assert.equal(report.summary.passed, RUNTIME_CONFORMANCE_CASES.length);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.capabilities.jsonSchema, 'PASS');
  assert.equal(report.capabilities.jsonMode, 'NOT_SUPPORTED');
  assert.equal(report.recommendation, 'CONFORMANT');
  assert.equal(report.conformanceScope, 'offline-runtime-protocol');
  assert.match(report.capabilityProfileDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(report.deploymentProfileDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(conformanceReportDigest(report), /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(report.failures, []);
  assert.equal(validateConformanceReport(report), report);
});

test('a required mismatch fails its capability and yields NON_CONFORMANT', async () => {
  const executor = createOfflineConformanceExecutor();
  const report = await runConformance({ runtime, generatedAt: FIXED_TIME }, {
    executeCase: async (caseDefinition, profile) => caseDefinition.id === 'http-500'
      ? { outcome: 'SUCCESS' }
      : executor(caseDefinition, profile)
  });

  assert.equal(report.summary.failed, 1);
  assert.equal(report.capabilities.httpErrors, 'FAIL');
  assert.deepEqual(report.failures.map((failure) => failure.caseId), ['http-500']);
  assert.equal(report.recommendation, 'NON_CONFORMANT');
});

test('report validation enforces totals, unique cases, and failure references', async () => {
  const report = await runConformance({ runtime, generatedAt: FIXED_TIME });
  const invalidTotal = structuredClone(report);
  invalidTotal.summary.total += 1;
  assert.throws(() => validateConformanceReport(invalidTotal), /case totals/);

  const duplicate = structuredClone(report);
  duplicate.cases[1].id = duplicate.cases[0].id;
  assert.throws(() => validateConformanceReport(duplicate), /duplicate case/);

  const invalidFailure = structuredClone(report);
  invalidFailure.failures.push({ caseId: report.cases[0].id, code: 'UNKNOWN', message: 'invalid' });
  assert.throws(() => validateConformanceReport(invalidFailure), /failure references non-failed case/);
});

test('report serializer is deterministic and writer creates a private artifact', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-conformance-'));
  try {
    const report = await runConformance({ runtime, generatedAt: FIXED_TIME });
    const target = path.join(directory, '.upgradelens/conformance-report.json');
    assert.equal(await writeConformanceReport(target, report), target);
    assert.equal(await readFile(target, 'utf8'), serializeConformanceReport(report));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('report builder is partially conformant when only an optional case fails', () => {
  const report = buildConformanceReport({
    runtime,
    ...reportReferences,
    generatedAt: FIXED_TIME,
    caseResults: RUNTIME_CONFORMANCE_CASES.map((caseDefinition) => ({
      id: caseDefinition.id,
      capability: caseDefinition.capability,
      capabilities: caseDefinition.capabilities,
      required: caseDefinition.required,
      capabilityStatus: caseDefinition.id === 'json-mode-capability' ? 'NOT_SUPPORTED' : 'PASS',
      status: caseDefinition.id === 'json-mode-capability' ? 'FAIL' : 'PASS',
      expected: caseDefinition.expected,
      observed: caseDefinition.id === 'json-mode-capability' ? 'INVALID_RESPONSE' : caseDefinition.expected
    }))
  });

  assert.equal(report.recommendation, 'PARTIALLY_CONFORMANT');
  assert.equal(report.capabilities.jsonMode, 'FAIL');
});

test('CLI supports --stdout without invoking analysis, evaluation, or benchmark runners', async () => {
  const stdout = capture();
  const stderr = capture();
  let conformanceCalls = 0;
  const report = await runConformance({ runtime, generatedAt: FIXED_TIME });
  const code = await runCli(['conformance', '--stdout'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    env: {},
    clock: () => new Date(FIXED_TIME),
    runConformance: async () => {
      conformanceCalls += 1;
      return report;
    },
    runEvaluation: () => assert.fail('Evaluation Runner must not run.'),
    runBenchmark: () => assert.fail('Benchmark Runner must not run.'),
    aiRuntime: { generateStructured: () => assert.fail('Version Analysis must not run.') }
  });

  assert.equal(code, 0);
  assert.equal(conformanceCalls, 1);
  assert.equal(JSON.parse(stdout.value()).recommendation, 'CONFORMANT');
  assert.equal(stderr.value(), '');
});

test('CLI defaults to .upgradelens/conformance-report.json and supports --output', async () => {
  const report = await runConformance({ runtime, generatedAt: FIXED_TIME });
  const writes = [];
  const commonIo = {
    stdout: capture().stream,
    stderr: capture().stream,
    env: {},
    runConformance: async () => report,
    writeConformanceReport: async (target, value) => {
      writes.push({ target, value });
      return target;
    }
  };

  assert.equal(await runCli(['conformance'], commonIo), 0);
  assert.equal(writes[0].target, path.resolve('.upgradelens/conformance-report.json'));
  assert.equal(writes[0].value, report);

  assert.equal(await runCli(['conformance', '--output', 'artifacts/custom.json'], commonIo), 0);
  assert.equal(writes[1].target, path.resolve('artifacts/custom.json'));
});
