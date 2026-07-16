import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_VERSION_ANALYSIS_PATH,
  VERSION_ANALYSIS_SCHEMA_VERSION
} from '../constants.js';
import { isPortableRelativePath } from '../portable.js';
import { loadProjectManifestInput } from '../project-manifest-input.js';
import { validateVersionAnalysisManifest } from '../version-analysis-manifest.js';

export class UsageDiscoveryInputError extends Error {
  constructor(message, code = 'USAGE_DISCOVERY_INPUT_INVALID') {
    super(`Usage Discovery input error: ${message}`);
    this.name = 'UsageDiscoveryInputError';
    this.code = code;
  }
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function readBytes(source, label) {
  if (typeof source === 'string' || source instanceof URL) return readFile(source);
  if (source && typeof source === 'object' && 'bytes' in source && source.bytes instanceof Uint8Array) {
    return Buffer.from(source.bytes);
  }
  throw new UsageDiscoveryInputError(`${label} source must be a file path or { bytes, artifact }.`);
}

function artifactFor(source, configured, defaultArtifact, label) {
  const artifact = source && typeof source === 'object' && 'bytes' in source
    ? source.artifact
    : configured ?? defaultArtifact;
  if (!isPortableRelativePath(artifact)) {
    throw new UsageDiscoveryInputError(`${label} artifact must be a portable repository-relative path.`);
  }
  return artifact;
}

function validateLineage(projectInput, versionAnalysis) {
  const expected = versionAnalysis.input.projectManifest;
  const actual = projectInput.input.projectManifest;
  const mismatches = [];
  if (expected.schemaVersion !== actual.schemaVersion) mismatches.push('schemaVersion');
  if (expected.artifactDigest !== actual.artifactDigest) mismatches.push('artifactDigest');
  if (expected.repository.name !== actual.repository.name) mismatches.push('repository.name');
  if (expected.repository.root !== actual.repository.root) mismatches.push('repository.root');
  if (mismatches.length > 0) {
    throw new UsageDiscoveryInputError(
      `Version Analysis Project Manifest lineage mismatch: ${mismatches.join(', ')}.`,
      'LINEAGE_MISMATCH'
    );
  }
}

function validateDependencyReferences(projectManifest, versionAnalysis) {
  const projects = new Map(projectManifest.projects.map((project) => [project.id, project]));
  const errors = [];
  for (const result of versionAnalysis.results) {
    const occurrence = result.dependency;
    const project = projects.get(occurrence.projectId);
    if (!project) {
      errors.push(`${occurrence.packageId} references unknown project ${occurrence.projectId}`);
      continue;
    }
    const declared = project.dependencies.some((dependency) => (
      dependency.normalizedName === occurrence.normalizedName
      && dependency.type === occurrence.dependencyType
      && dependency.manifest === occurrence.manifest
    ));
    if (!declared) {
      errors.push(`${occurrence.packageId} does not match a declared dependency in ${occurrence.projectId}`);
    }
    if (project.ecosystem !== occurrence.ecosystem) {
      errors.push(`${occurrence.packageId} ecosystem does not match project ${occurrence.projectId}`);
    }
  }
  if (errors.length > 0) {
    throw new UsageDiscoveryInputError(`invalid dependency references: ${errors.sort().join('; ')}.`);
  }
}

export async function loadUsageDiscoveryInputs(sources, options = {}) {
  if (!sources?.projectManifest || !sources?.versionAnalysis) {
    throw new UsageDiscoveryInputError('projectManifest and versionAnalysis sources are required.');
  }
  const projectArtifact = artifactFor(
    sources.projectManifest,
    options.projectManifestArtifact,
    DEFAULT_MANIFEST_PATH,
    'Project Manifest'
  );
  const versionArtifact = artifactFor(
    sources.versionAnalysis,
    options.versionAnalysisArtifact,
    DEFAULT_VERSION_ANALYSIS_PATH,
    'Version Analysis'
  );
  const [projectInput, versionBytes] = await Promise.all([
    loadProjectManifestInput(sources.projectManifest, { artifact: projectArtifact }),
    readBytes(sources.versionAnalysis, 'Version Analysis')
  ]);

  let versionAnalysis;
  try {
    versionAnalysis = JSON.parse(versionBytes.toString('utf8'));
  } catch {
    throw new UsageDiscoveryInputError('Version Analysis bytes are not valid JSON.');
  }
  if (versionAnalysis?.schemaVersion !== VERSION_ANALYSIS_SCHEMA_VERSION) {
    throw new UsageDiscoveryInputError(
      `unsupported Version Analysis schema version; expected ${VERSION_ANALYSIS_SCHEMA_VERSION}.`
    );
  }
  try {
    validateVersionAnalysisManifest(versionAnalysis);
  } catch (error) {
    throw new UsageDiscoveryInputError(error.message);
  }
  validateLineage(projectInput, versionAnalysis);
  validateDependencyReferences(projectInput.manifest, versionAnalysis);

  return {
    projectManifest: projectInput.manifest,
    versionAnalysis,
    input: {
      projectManifest: projectInput.input.projectManifest,
      versionAnalysis: {
        schemaVersion: versionAnalysis.schemaVersion,
        artifact: versionArtifact,
        artifactDigest: digest(versionBytes)
      }
    }
  };
}

