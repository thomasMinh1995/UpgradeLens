import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadGovernanceBundle } from '../src/governance-loader.js';
import { buildGovernanceChain } from './fixtures/governance-chain.js';

async function writeChain(root, chain) {
  await mkdir(root, { recursive: true });
  const paths = {};
  for (const [artifact, value] of Object.entries(chain)) {
    paths[artifact] = path.join(root, `${artifact}.json`);
    await writeFile(paths[artifact], `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
  return paths;
}

test('loads, validates, links, and returns a verified portable Governance Bundle', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-governance-loader-'));
  try {
    const chain = await buildGovernanceChain();
    const paths = await writeChain(root, chain);
    const result = await loadGovernanceBundle(paths, { task: 'MVP-03' });

    assert.equal(result.valid, true);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.bundle.capabilityProfile, chain.capabilityProfile);
    assert.deepEqual(result.bundle.qualificationRecord, chain.qualificationRecord);
    assert.match(result.bundle.digests.conformanceReport, /^sha256:[a-f0-9]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('collects missing and malformed JSON diagnostics without absolute path leakage', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-governance-loader-invalid-'));
  try {
    const malformed = path.join(root, 'deployment.json');
    await writeFile(malformed, '{broken', 'utf8');
    const result = await loadGovernanceBundle({ deploymentProfile: malformed });

    assert.equal(result.valid, false);
    assert.equal(result.bundle, null);
    assert.deepEqual(result.diagnostics.map((item) => item.code), [
      'UNKNOWN_CAPABILITY',
      'INVALID_JSON',
      'UNKNOWN_CONFORMANCE',
      'UNKNOWN_QUALIFICATION'
    ]);
    assert.ok(result.diagnostics.every((item) => item.stage === 1));
    assert.doesNotMatch(JSON.stringify(result.diagnostics), new RegExp(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('schema-invalid artifacts do not enter digest or downstream deployment validation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-governance-loader-schema-'));
  try {
    const chain = await buildGovernanceChain();
    delete chain.deploymentProfile.provider;
    const paths = await writeChain(root, chain);
    const result = await loadGovernanceBundle(paths);

    const deploymentDiagnostics = result.diagnostics.filter((item) => item.artifact === 'deploymentProfile');
    assert.deepEqual(deploymentDiagnostics.map((item) => item.code), ['INVALID_SCHEMA']);
    assert.equal(deploymentDiagnostics[0].stage, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('loader detects cross-digest mismatch and never rewrites loaded artifacts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-governance-loader-digest-'));
  try {
    const chain = await buildGovernanceChain();
    chain.qualificationRecord.conformanceReportDigest = `sha256:${'0'.repeat(64)}`;
    const paths = await writeChain(root, chain);
    const result = await loadGovernanceBundle(paths);

    assert.equal(result.valid, false);
    assert.equal(result.bundle, null);
    assert.deepEqual(result.diagnostics.map((item) => item.code), ['DIGEST_MISMATCH']);
    assert.equal(result.diagnostics[0].path, '$.conformanceReportDigest');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
