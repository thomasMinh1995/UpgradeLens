import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_UPGRADE_DECISION_PATH } from '../constants.js';
import { isPortableRelativePath } from '../portable.js';
import { buildUpgradeDecision, validateUpgradeDecision } from './upgrade-decision.js';

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sourceFor(input, options) {
  const explicit = options.upgradeDecision ?? input?.upgradeDecision ?? input?.sources?.upgradeDecision;
  if (explicit !== undefined) return { source: explicit, required: true };
  if (typeof input === 'string' || input === undefined || input === null) {
    return {
      source: path.resolve(input ?? '.', options.upgradeDecisionArtifact ?? DEFAULT_UPGRADE_DECISION_PATH),
      required: false
    };
  }
  if (input instanceof URL) {
    return {
      source: new URL(options.upgradeDecisionArtifact ?? DEFAULT_UPGRADE_DECISION_PATH, input),
      required: false
    };
  }
  if (typeof input.repositoryRoot === 'string') {
    return {
      source: path.resolve(
        input.repositoryRoot,
        options.upgradeDecisionArtifact ?? DEFAULT_UPGRADE_DECISION_PATH
      ),
      required: false
    };
  }
  return { source: undefined, required: false };
}

function artifactFor(source, options) {
  const explicit = source && typeof source === 'object' && !(source instanceof URL)
    ? source.artifact
    : undefined;
  const artifact = explicit ?? options.upgradeDecisionArtifact ?? DEFAULT_UPGRADE_DECISION_PATH;
  if (!isPortableRelativePath(artifact)) {
    throw new Error('Upgrade Decision input error: artifact path must be repository-relative.');
  }
  return artifact;
}

async function readBytes(source) {
  if (typeof source === 'string' || source instanceof URL) return readFile(source);
  if (source?.bytes instanceof Uint8Array) return Buffer.from(source.bytes);
  if (typeof source?.path === 'string' || source?.path instanceof URL) return readFile(source.path);
  throw new Error('Upgrade Decision input error: unsupported artifact source.');
}

export async function loadPersistedUpgradeDecision(input, artifacts, options = {}) {
  const selected = sourceFor(input, options);
  if (selected.source === undefined) return artifacts;
  let bytes;
  try {
    bytes = await readBytes(selected.source);
  } catch (error) {
    if (!selected.required && error?.code === 'ENOENT') return artifacts;
    throw error;
  }
  let decision;
  try {
    decision = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Upgrade Decision input error: artifact is not valid JSON.');
  }
  validateUpgradeDecision(decision);
  if (!sameJson(decision.input, artifacts.input)) {
    throw new Error('Upgrade Decision input error: upstream artifact lineage mismatch.');
  }
  const resultIds = artifacts.versionAnalysis.results.map((result) => result.id).sort();
  const decisionIds = decision.decisions
    .map((record) => record.analysisResultId)
    .filter((value) => value !== null)
    .sort();
  if (!sameJson(resultIds, decisionIds)) {
    throw new Error('Upgrade Decision input error: dependency occurrence set mismatch.');
  }
  const expected = buildUpgradeDecision(artifacts);
  if (!sameJson(decision, expected)) {
    throw new Error('Upgrade Decision input error: artifact does not match deterministic policy output.');
  }
  const artifact = artifactFor(selected.source, options);
  return {
    ...artifacts,
    upgradeDecision: decision,
    input: {
      ...artifacts.input,
      upgradeDecision: {
        schemaVersion: decision.schemaVersion,
        artifact,
        artifactDigest: digest(bytes)
      }
    }
  };
}
