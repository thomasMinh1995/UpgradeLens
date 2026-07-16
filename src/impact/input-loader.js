import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { DEFAULT_USAGE_INDEX_PATH, USAGE_INDEX_SCHEMA_VERSION } from '../constants.js';
import { isPortableRelativePath } from '../portable.js';
import { UsageDiscoveryInputError, loadUsageDiscoveryInputs } from '../usage/input-loader.js';
import { validateUsageIndex } from '../usage/usage-index.js';

export class ImpactAnalysisInputError extends Error {
  constructor(message, code = 'IMPACT_ANALYSIS_INPUT_INVALID') {
    super(`Impact Analysis input error: ${message}`);
    this.name = 'ImpactAnalysisInputError';
    this.code = code;
  }
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function readBytes(source) {
  if (typeof source === 'string' || source instanceof URL) return readFile(source);
  if (source && typeof source === 'object' && 'bytes' in source && source.bytes instanceof Uint8Array) {
    return Buffer.from(source.bytes);
  }
  throw new ImpactAnalysisInputError('Usage Index source must be a file path or { bytes, artifact }.');
}

function artifactFor(source, configured) {
  const artifact = source && typeof source === 'object' && 'bytes' in source
    ? source.artifact
    : configured ?? DEFAULT_USAGE_INDEX_PATH;
  if (!isPortableRelativePath(artifact)) {
    throw new ImpactAnalysisInputError('Usage Index artifact must be a portable repository-relative path.');
  }
  return artifact;
}

function lineageMismatches(expected, actual, fields) {
  return fields.filter((field) => {
    const path = field.split('.');
    const read = (value) => path.reduce((current, segment) => current?.[segment], value);
    return read(expected) !== read(actual);
  });
}

function validateLineage(baseInput, usageIndex) {
  const projectMismatches = lineageMismatches(
    usageIndex.input.projectManifest,
    baseInput.projectManifest,
    ['schemaVersion', 'artifact', 'artifactDigest', 'repository.name', 'repository.root']
  );
  const versionMismatches = lineageMismatches(
    usageIndex.input.versionAnalysis,
    baseInput.versionAnalysis,
    ['schemaVersion', 'artifact', 'artifactDigest']
  );
  const mismatches = [
    ...projectMismatches.map((field) => `Project Manifest ${field}`),
    ...versionMismatches.map((field) => `Version Analysis ${field}`)
  ];
  if (mismatches.length > 0) {
    throw new ImpactAnalysisInputError(
      `Usage Index lineage mismatch: ${mismatches.join(', ')}.`,
      'LINEAGE_MISMATCH'
    );
  }
}

function validateUsageReferences(versionAnalysis, usageIndex) {
  const results = new Map();
  for (const result of versionAnalysis.results) {
    const key = `${result.dependency.projectId}\0${result.dependency.packageId}`;
    if (!results.has(key)) results.set(key, []);
    results.get(key).push(result);
  }
  const errors = [];
  for (const usage of usageIndex.dependencies) {
    const key = `${usage.projectId}\0${usage.packageId}`;
    const candidates = results.get(key) ?? [];
    if (candidates.length === 0) {
      errors.push(`${usage.packageId} in ${usage.projectId} has no Version Analysis result`);
    } else if (!candidates.some((result) => result.dependency.declaredName === usage.name)) {
      errors.push(`${usage.packageId} in ${usage.projectId} has a dependency-name mismatch`);
    }
  }
  if (errors.length > 0) {
    throw new ImpactAnalysisInputError(`invalid Usage Index references: ${errors.sort().join('; ')}.`);
  }
}

export async function loadImpactAnalysisInputs(sources, options = {}) {
  if (!sources?.projectManifest || !sources?.versionAnalysis || !sources?.usageIndex) {
    throw new ImpactAnalysisInputError('projectManifest, versionAnalysis, and usageIndex sources are required.');
  }
  let base;
  try {
    base = await loadUsageDiscoveryInputs(sources, options);
  } catch (error) {
    if (error instanceof UsageDiscoveryInputError) {
      throw new ImpactAnalysisInputError(error.message, error.code);
    }
    throw error;
  }
  const artifact = artifactFor(sources.usageIndex, options.usageIndexArtifact);
  const bytes = await readBytes(sources.usageIndex);
  let usageIndex;
  try {
    usageIndex = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ImpactAnalysisInputError('Usage Index bytes are not valid JSON.');
  }
  if (usageIndex?.schemaVersion !== USAGE_INDEX_SCHEMA_VERSION) {
    throw new ImpactAnalysisInputError(
      `unsupported Usage Index schema version; expected ${USAGE_INDEX_SCHEMA_VERSION}.`
    );
  }
  try {
    validateUsageIndex(usageIndex);
  } catch (error) {
    throw new ImpactAnalysisInputError(error.message);
  }
  validateLineage(base.input, usageIndex);
  validateUsageReferences(base.versionAnalysis, usageIndex);

  return {
    projectManifest: base.projectManifest,
    versionAnalysis: base.versionAnalysis,
    usageIndex,
    input: {
      ...base.input,
      usageIndex: {
        schemaVersion: usageIndex.schemaVersion,
        artifact,
        artifactDigest: digest(bytes)
      }
    }
  };
}
