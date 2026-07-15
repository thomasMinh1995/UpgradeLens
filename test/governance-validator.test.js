import assert from 'node:assert/strict';
import test from 'node:test';

import { conformanceReportDigest } from '../src/conformance-report.js';
import {
  buildQualificationRecord,
  capabilityProfileDigest,
  deploymentProfileDigest
} from '../src/governance-metadata.js';
import { validateGovernanceArtifacts } from '../src/governance-validator.js';
import { buildGovernanceChain } from './fixtures/governance-chain.js';

function relink(chain) {
  chain.deploymentProfile.capabilityProfileDigest = capabilityProfileDigest(chain.capabilityProfile);
  chain.conformanceReport.capabilityProfileDigest = capabilityProfileDigest(chain.capabilityProfile);
  chain.qualificationRecord.capabilityProfileDigest = capabilityProfileDigest(chain.capabilityProfile);
  const deploymentDigest = deploymentProfileDigest(chain.deploymentProfile);
  chain.conformanceReport.deploymentProfileDigest = deploymentDigest;
  chain.qualificationRecord.deploymentProfileDigest = deploymentDigest;
  chain.qualificationRecord.conformanceReportDigest = conformanceReportDigest(chain.conformanceReport);
  return chain;
}

test('validates one exact four-artifact governance chain without mutation', async () => {
  const chain = await buildGovernanceChain();
  const before = JSON.stringify(chain);
  const result = validateGovernanceArtifacts(chain, { task: 'MVP-03' });

  assert.equal(result.valid, true);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.bundle.capabilityProfile, chain.capabilityProfile);
  assert.equal(result.bundle.deploymentProfile, chain.deploymentProfile);
  assert.match(result.bundle.digests.capabilityProfile, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.bundle.digests.qualificationRecord, /^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(chain), before);
});

test('detects every canonical cross-digest mismatch and withholds the verified bundle', async () => {
  const chain = await buildGovernanceChain();
  const wrong = `sha256:${'f'.repeat(64)}`;
  chain.deploymentProfile.capabilityProfileDigest = wrong;
  chain.conformanceReport.capabilityProfileDigest = wrong;
  chain.qualificationRecord.capabilityProfileDigest = wrong;
  chain.conformanceReport.deploymentProfileDigest = wrong;
  chain.qualificationRecord.deploymentProfileDigest = wrong;
  chain.qualificationRecord.conformanceReportDigest = wrong;

  const result = validateGovernanceArtifacts(chain);
  assert.equal(result.valid, false);
  assert.equal(result.bundle, null);
  assert.equal(result.diagnostics.filter((item) => item.code === 'DIGEST_MISMATCH').length, 6);
  assert.ok(result.diagnostics.every((item) => item.stage === 4));
});

test('detects an unknown Capability Profile ID even when all digests are relinked', async () => {
  const chain = await buildGovernanceChain();
  chain.deploymentProfile.capabilityProfile = 'different-capability';
  relink(chain);

  const result = validateGovernanceArtifacts(chain);
  assert.deepEqual(result.diagnostics.map((item) => item.code), ['UNKNOWN_CAPABILITY']);
  assert.equal(result.diagnostics[0].path, '$.capabilityProfile');
});

test('detects Conformance Report runtime identity mismatch independently of digest linkage', async () => {
  const chain = await buildGovernanceChain();
  chain.conformanceReport.runtime.model = 'different-model';
  chain.qualificationRecord.conformanceReportDigest = conformanceReportDigest(chain.conformanceReport);

  const result = validateGovernanceArtifacts(chain);
  assert.deepEqual(result.diagnostics.map((item) => item.code), ['UNKNOWN_DEPLOYMENT']);
});

test('CERTIFIED and SUPPORTED require a CONFORMANT report', async () => {
  for (const recommendation of ['PARTIALLY_CONFORMANT', 'NON_CONFORMANT']) {
    for (const status of ['SUPPORTED', 'CERTIFIED']) {
      const chain = await buildGovernanceChain({ status, recommendation });
      const result = validateGovernanceArtifacts(chain);
      assert.ok(result.diagnostics.some((item) => item.code === 'INVALID_CERTIFICATION_STATE'));
      assert.equal(result.valid, false);
    }
  }
});

test('does not auto-promote EXPERIMENTAL when conformance is valid', async () => {
  const chain = await buildGovernanceChain({ status: 'EXPERIMENTAL' });
  const result = validateGovernanceArtifacts(chain);
  assert.equal(result.valid, true);
  assert.equal(result.bundle.qualificationRecord.status, 'EXPERIMENTAL');
});

test('CERTIFIED rejects mutable latest aliases without revision pinning', async () => {
  const unpinned = await buildGovernanceChain({ status: 'CERTIFIED', model: 'qwen3:latest' });
  const invalid = validateGovernanceArtifacts(unpinned);
  assert.ok(invalid.diagnostics.some((item) => (
    item.code === 'INVALID_CERTIFICATION_STATE' && /mutable model alias/.test(item.message)
  )));

  const mutableRevision = await buildGovernanceChain({
    status: 'CERTIFIED',
    model: 'qwen3:latest',
    modelRevision: 'latest'
  });
  assert.equal(validateGovernanceArtifacts(mutableRevision).valid, false);

  const pinned = await buildGovernanceChain({
    status: 'CERTIFIED',
    model: 'qwen3:latest',
    modelRevision: 'sha256-model-revision-1234'
  });
  assert.equal(validateGovernanceArtifacts(pinned).valid, true);
});

test('task scope must be explicit and is checked independently per requested task', async () => {
  const chain = await buildGovernanceChain({ qualifiedFor: ['MVP-03'] });
  const result = validateGovernanceArtifacts(chain, { tasks: ['MVP-05', 'MVP-04', 'MVP-03'] });

  assert.equal(result.valid, false);
  assert.deepEqual(
    result.diagnostics.map((item) => item.code),
    ['TASK_SCOPE_MISMATCH', 'TASK_SCOPE_MISMATCH']
  );
  assert.ok(result.diagnostics.every((item) => item.stage === 6));
});

test('collects deterministic diagnostics in validation-stage order', async () => {
  const chain = await buildGovernanceChain({ status: 'CERTIFIED', model: 'qwen3:latest' });
  chain.deploymentProfile.capabilityProfile = 'unknown-capability';
  chain.qualificationRecord.capabilityProfileDigest = `sha256:${'e'.repeat(64)}`;
  const first = validateGovernanceArtifacts(chain, { task: 'MVP-05' });
  const second = validateGovernanceArtifacts(chain, { task: 'MVP-05' });

  assert.deepEqual(first.diagnostics, second.diagnostics);
  assert.deepEqual(
    first.diagnostics.map((item) => item.stage),
    [...first.diagnostics.map((item) => item.stage)].sort((left, right) => left - right)
  );
  assert.ok(first.diagnostics.length >= 4);
});

test('reports unavailable artifacts without throwing or attempting reverse validation', () => {
  const result = validateGovernanceArtifacts({});

  assert.equal(result.valid, false);
  assert.equal(result.bundle, null);
  assert.deepEqual(result.diagnostics.map((item) => item.code), [
    'UNKNOWN_CAPABILITY',
    'UNKNOWN_DEPLOYMENT',
    'UNKNOWN_CONFORMANCE',
    'UNKNOWN_QUALIFICATION'
  ]);
  assert.ok(result.diagnostics.every((item) => item.stage === 1));
});
