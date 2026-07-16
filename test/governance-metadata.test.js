import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCli } from '../src/cli.js';
import {
  conformanceReportDigest,
  validateConformanceReport
} from '../src/conformance-report.js';
import { runConformance } from '../src/conformance-runner.js';
import {
  buildCapabilityProfile,
  buildDeploymentProfile,
  buildQualificationRecord,
  capabilityProfileDigest,
  createDefaultGovernanceArtifacts,
  deploymentProfileDigest,
  qualificationRecordDigest,
  serializeCapabilityProfile,
  serializeDeploymentProfile,
  serializeGovernanceArtifacts,
  serializeQualificationRecord,
  validateCapabilityProfile,
  validateDeploymentProfile,
  validateQualificationRecord,
  writeGovernanceArtifacts
} from '../src/governance-metadata.js';

const DIGEST = `sha256:${'a'.repeat(64)}`;

function capture() {
  let value = '';
  return {
    stream: { write(chunk) { value += chunk; } },
    value() { return value; }
  };
}

function sampleCapability() {
  return buildCapabilityProfile({
    capabilityId: 'openai-compatible-v1',
    protocol: 'chat-completions',
    structuredOutput: 'jsonSchema',
    jsonMode: false,
    streaming: false,
    toolCalling: false,
    responsesApi: false,
    usageMetadata: true,
    identityVerification: true,
    timeoutSupported: true
  });
}

function sampleDeployment() {
  const capability = sampleCapability();
  return buildDeploymentProfile({
    deploymentId: 'ollama-qwen3-local',
    provider: 'openai-compatible',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    model: 'qwen3:latest',
    capabilityProfile: 'openai-compatible-v1',
    capabilityProfileDigest: capabilityProfileDigest(capability),
    timeoutSeconds: 180,
    maxResponseBytes: 1_048_576
  });
}

test('capability, deployment, and qualification examples validate against their schemas', () => {
  const capability = sampleCapability();
  const deployment = sampleDeployment();
  const qualification = buildQualificationRecord({
    qualificationId: 'qwen3-local',
    deploymentProfileDigest: deploymentProfileDigest(deployment),
    capabilityProfileDigest: capabilityProfileDigest(capability),
    conformanceReportDigest: null,
    status: 'EXPERIMENTAL',
    qualifiedFor: ['MVP-03']
  });

  assert.equal(validateCapabilityProfile(capability), capability);
  assert.equal(validateDeploymentProfile(deployment), deployment);
  assert.equal(validateQualificationRecord(qualification), qualification);
  assert.match(qualificationRecordDigest(qualification), /^sha256:[a-f0-9]{64}$/);
});

test('canonical profile digests do not depend on object property order', () => {
  const capability = sampleCapability();
  const reordered = Object.fromEntries(Object.entries(capability).reverse());
  assert.equal(capabilityProfileDigest(reordered), capabilityProfileDigest(capability));

  const deployment = sampleDeployment();
  const changed = { ...deployment, model: 'qwen3:8b' };
  assert.notEqual(deploymentProfileDigest(changed), deploymentProfileDigest(deployment));
});

test('qualification tasks are unique and use stable lexical ordering', () => {
  const record = buildQualificationRecord({
    qualificationId: 'task-scoped-record',
    deploymentProfileDigest: DIGEST,
    capabilityProfileDigest: DIGEST,
    status: 'EXPERIMENTAL',
    qualifiedFor: ['MVP-05', 'MVP-03', 'MVP-04', 'MVP-03']
  });

  assert.deepEqual(record.qualifiedFor, ['MVP-03', 'MVP-04', 'MVP-05']);
  const unsorted = structuredClone(record);
  unsorted.qualifiedFor.reverse();
  assert.throws(() => validateQualificationRecord(unsorted), /stable lexical ordering/);
});

test('qualification status enum is closed and stronger states require conformance evidence', () => {
  const base = {
    qualificationId: 'qualification-policy',
    deploymentProfileDigest: DIGEST,
    capabilityProfileDigest: DIGEST,
    qualifiedFor: ['MVP-03']
  };
  for (const status of ['EXPERIMENTAL', 'DEPRECATED', 'RETIRED']) {
    assert.equal(buildQualificationRecord({ ...base, status }).status, status);
  }
  for (const status of ['SUPPORTED', 'CERTIFIED']) {
    assert.throws(() => buildQualificationRecord({ ...base, status }), /requires a conformanceReportDigest/);
    assert.equal(buildQualificationRecord({
      ...base,
      status,
      conformanceReportDigest: DIGEST
    }).status, status);
  }
  assert.throws(
    () => buildQualificationRecord({ ...base, status: 'NOT_SUPPORTED' }),
    /schema validation failed/
  );
});

test('governance metadata rejects secret fields, credential URLs, query secrets, and secret-like values', () => {
  assert.throws(
    () => validateDeploymentProfile({ ...sampleDeployment(), authorization: 'Bearer hidden' }),
    /forbidden field/
  );
  assert.throws(
    () => validateDeploymentProfile({
      ...sampleDeployment(),
      endpoint: 'https://user:password@example.com/v1/chat/completions'
    }),
    /credentials, query parameters, or fragments/
  );
  assert.throws(
    () => validateDeploymentProfile({
      ...sampleDeployment(),
      endpoint: 'https://example.com/v1/chat/completions?api_key=hidden'
    }),
    /credentials, query parameters, or fragments/
  );
  assert.throws(
    () => validateDeploymentProfile({ ...sampleDeployment(), model: 'sk-secretvalue' }),
    /secret-like value/
  );
  assert.throws(
    () => validateCapabilityProfile({ ...sampleCapability(), prompt: 'hidden' }),
    /forbidden field/
  );
});

test('default governance artifacts cross-link exact profile digests and remain experimental', () => {
  const artifacts = createDefaultGovernanceArtifacts({
    provider: 'openai-compatible',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    model: 'qwen3:latest'
  });

  assert.equal(
    artifacts.qualificationRecord.capabilityProfileDigest,
    capabilityProfileDigest(artifacts.capabilityProfile)
  );
  assert.equal(
    artifacts.qualificationRecord.deploymentProfileDigest,
    deploymentProfileDigest(artifacts.deploymentProfile)
  );
  assert.equal(artifacts.qualificationRecord.conformanceReportDigest, null);
  assert.equal(artifacts.qualificationRecord.status, 'EXPERIMENTAL');
  assert.deepEqual(artifacts.qualificationRecord.qualifiedFor, ['MVP-03']);
});

test('serializers are deterministic and governance writers create private artifacts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-governance-'));
  try {
    const artifacts = createDefaultGovernanceArtifacts();
    const targets = await writeGovernanceArtifacts(path.join(root, '.upgradelens'), artifacts);
    assert.equal(await readFile(targets.capabilityProfile, 'utf8'), serializeCapabilityProfile(artifacts.capabilityProfile));
    assert.equal(await readFile(targets.deploymentProfile, 'utf8'), serializeDeploymentProfile(artifacts.deploymentProfile));
    assert.equal(await readFile(targets.qualificationRecord, 'utf8'), serializeQualificationRecord(artifacts.qualificationRecord));
    for (const target of Object.values(targets)) {
      assert.equal((await stat(target)).mode & 0o777, 0o600);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('conformance report uses governance references and never uses qualification vocabulary', async () => {
  const report = await runConformance({ generatedAt: '2026-07-15T00:00:00.000Z' });
  assert.equal(report.recommendation, 'CONFORMANT');
  assert.equal(report.conformanceScope, 'offline-runtime-protocol');
  assert.match(report.capabilityProfileDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(report.deploymentProfileDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(conformanceReportDigest(report), /^sha256:[a-f0-9]{64}$/);

  const invalid = { ...report, recommendation: 'CERTIFIED' };
  assert.throws(() => validateConformanceReport(invalid), /schema validation failed/);
});

test('governance CLI supports stdout and never calls runtime, analysis, evaluation, or benchmark', async () => {
  const stdout = capture();
  const stderr = capture();
  let createCalls = 0;
  const artifacts = createDefaultGovernanceArtifacts();
  const code = await runCli(['governance', '--stdout'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    env: {},
    createDefaultGovernanceArtifacts: () => {
      createCalls += 1;
      return artifacts;
    },
    runConformance: () => assert.fail('Conformance suite must not run.'),
    runEvaluation: () => assert.fail('Evaluation Runner must not run.'),
    runBenchmark: () => assert.fail('Benchmark Runner must not run.'),
    aiRuntime: { generateStructured: () => assert.fail('AI Runtime must not run.') }
  });

  assert.equal(code, 0);
  assert.equal(createCalls, 1);
  assert.deepEqual(JSON.parse(stdout.value()), JSON.parse(serializeGovernanceArtifacts(artifacts)));
  assert.equal(stderr.value(), '');
});

test('governance CLI writes three files to the default or custom output directory', async () => {
  const artifacts = createDefaultGovernanceArtifacts();
  const writes = [];
  const io = {
    stdout: capture().stream,
    stderr: capture().stream,
    env: {},
    createDefaultGovernanceArtifacts: () => artifacts,
    writeGovernanceArtifacts: async (directory, value) => {
      writes.push({ directory, value });
      return {
        capabilityProfile: path.join(directory, 'capability-profile.json'),
        deploymentProfile: path.join(directory, 'deployment-profile.json'),
        qualificationRecord: path.join(directory, 'qualification-record.json')
      };
    }
  };

  assert.equal(await runCli(['governance'], io), 0);
  assert.equal(writes[0].directory, path.resolve('.upgradelens'));
  assert.equal(await runCli(['governance', '--output', 'artifacts/governance'], io), 0);
  assert.equal(writes[1].directory, path.resolve('artifacts/governance'));
});
