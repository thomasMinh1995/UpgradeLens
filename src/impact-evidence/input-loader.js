import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  DEFAULT_REPOSITORY_IMPACT_PATH,
  REPOSITORY_IMPACT_SCHEMA_VERSION
} from '../constants.js';
import { ImpactAnalysisInputError, loadImpactAnalysisInputs } from '../impact/input-loader.js';
import {
  EXACT_SYMBOL_MATCHER_ID,
  EXACT_SYMBOL_MATCHER_VERSION,
  matchFindingToUsage
} from '../impact/matcher.js';
import { validateRepositoryImpact } from '../impact/repository-impact.js';
import { isPortableRelativePath } from '../portable.js';

export class ImpactEvidenceInputError extends Error {
  constructor(message, code = 'IMPACT_EVIDENCE_INPUT_INVALID') {
    super(`Impact Evidence input error: ${message}`);
    this.name = 'ImpactEvidenceInputError';
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
  throw new ImpactEvidenceInputError(
    'Repository Impact source must be a file path or { bytes, artifact }.'
  );
}

function artifactFor(source, configured) {
  const artifact = source && typeof source === 'object' && 'bytes' in source
    ? source.artifact
    : configured ?? DEFAULT_REPOSITORY_IMPACT_PATH;
  if (!isPortableRelativePath(artifact)) {
    throw new ImpactEvidenceInputError(
      'Repository Impact artifact must be a portable repository-relative path.'
    );
  }
  return artifact;
}

function readField(value, field) {
  return field.split('.').reduce((current, segment) => current?.[segment], value);
}

function validateLineage(baseInput, repositoryImpact) {
  const groups = [
    ['Project Manifest', repositoryImpact.input.projectManifest, baseInput.projectManifest,
      ['schemaVersion', 'artifact', 'artifactDigest', 'repository.name', 'repository.root']],
    ['Version Analysis', repositoryImpact.input.versionAnalysis, baseInput.versionAnalysis,
      ['schemaVersion', 'artifact', 'artifactDigest']],
    ['Usage Index', repositoryImpact.input.usageIndex, baseInput.usageIndex,
      ['schemaVersion', 'artifact', 'artifactDigest']]
  ];
  const mismatches = groups.flatMap(([label, expected, actual, fields]) => (
    fields
      .filter((field) => readField(expected, field) !== readField(actual, field))
      .map((field) => `${label} ${field}`)
  ));
  if (mismatches.length > 0) {
    throw new ImpactEvidenceInputError(
      `Repository Impact lineage mismatch: ${mismatches.join(', ')}.`,
      'LINEAGE_MISMATCH'
    );
  }
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateReferences(versionAnalysis, usageIndex, repositoryImpact) {
  if (repositoryImpact.analysis.matcher.id !== EXACT_SYMBOL_MATCHER_ID
      || repositoryImpact.analysis.matcher.version !== EXACT_SYMBOL_MATCHER_VERSION) {
    throw new ImpactEvidenceInputError(
      `unsupported impact matcher; expected ${EXACT_SYMBOL_MATCHER_ID}@${EXACT_SYMBOL_MATCHER_VERSION}.`,
      'MATCHER_UNSUPPORTED'
    );
  }
  const results = new Map(versionAnalysis.results.map((result) => [result.id, result]));
  const usages = new Map(usageIndex.dependencies.map((usage) => (
    [`${usage.projectId}\0${usage.packageId}`, usage]
  )));
  const errors = [];
  for (const dependency of repositoryImpact.dependencies) {
    const result = results.get(dependency.analysisResultId);
    if (!result) {
      errors.push(`unknown Version Analysis result ${dependency.analysisResultId}`);
      continue;
    }
    if (dependency.projectId !== result.dependency.projectId
        || dependency.packageId !== result.dependency.packageId
        || dependency.name !== result.dependency.declaredName) {
      errors.push(`dependency identity mismatch for ${dependency.analysisResultId}`);
    }
    const versionFindings = result.findings.filter((finding) => finding.kind === 'breakingChange');
    if (versionFindings.length !== dependency.findings.length) {
      errors.push(`finding count mismatch for ${dependency.analysisResultId}`);
      continue;
    }
    const findings = new Map(versionFindings.map((finding) => [finding.id, finding]));
    const usage = usages.get(`${dependency.projectId}\0${dependency.packageId}`) ?? null;
    for (const impactFinding of dependency.findings) {
      const sourceFinding = findings.get(impactFinding.id);
      if (!sourceFinding) {
        errors.push(`unknown finding ${impactFinding.id} for ${dependency.analysisResultId}`);
        continue;
      }
      if (impactFinding.summary !== sourceFinding.summary) {
        errors.push(`finding summary mismatch for ${dependency.analysisResultId}/${impactFinding.id}`);
      }
      const expectedMatches = matchFindingToUsage(sourceFinding, usage);
      if (!sameValue(impactFinding.matches, expectedMatches)) {
        errors.push(`usage match mismatch for ${dependency.analysisResultId}/${impactFinding.id}`);
      }
    }
  }
  if (repositoryImpact.dependencies.length !== versionAnalysis.results.length) {
    errors.push('Repository Impact dependency count does not match Version Analysis results');
  }
  if (errors.length > 0) {
    throw new ImpactEvidenceInputError(`invalid artifact references: ${errors.sort().join('; ')}.`);
  }
}

export async function loadImpactEvidenceInputs(sources, options = {}) {
  if (!sources?.projectManifest || !sources?.versionAnalysis || !sources?.usageIndex
      || !sources?.repositoryImpact) {
    throw new ImpactEvidenceInputError(
      'projectManifest, versionAnalysis, usageIndex, and repositoryImpact sources are required.'
    );
  }
  let base;
  try {
    base = await loadImpactAnalysisInputs(sources, options);
  } catch (error) {
    if (error instanceof ImpactAnalysisInputError) {
      throw new ImpactEvidenceInputError(error.message, error.code);
    }
    throw error;
  }
  const artifact = artifactFor(sources.repositoryImpact, options.repositoryImpactArtifact);
  const bytes = await readBytes(sources.repositoryImpact);
  let repositoryImpact;
  try {
    repositoryImpact = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ImpactEvidenceInputError('Repository Impact bytes are not valid JSON.');
  }
  if (repositoryImpact?.schemaVersion !== REPOSITORY_IMPACT_SCHEMA_VERSION) {
    throw new ImpactEvidenceInputError(
      `unsupported Repository Impact schema version; expected ${REPOSITORY_IMPACT_SCHEMA_VERSION}.`
    );
  }
  try {
    validateRepositoryImpact(repositoryImpact);
  } catch (error) {
    throw new ImpactEvidenceInputError(error.message);
  }
  validateLineage(base.input, repositoryImpact);
  validateReferences(base.versionAnalysis, base.usageIndex, repositoryImpact);

  return {
    projectManifest: base.projectManifest,
    versionAnalysis: base.versionAnalysis,
    usageIndex: base.usageIndex,
    repositoryImpact,
    input: {
      ...base.input,
      repositoryImpact: {
        schemaVersion: repositoryImpact.schemaVersion,
        artifact,
        artifactDigest: digest(bytes)
      }
    }
  };
}
