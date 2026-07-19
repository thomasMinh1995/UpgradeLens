import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  DEFAULT_OUTPUT_DIRECTORY,
  DEFAULT_KNOWLEDGE_MANIFEST_PATH,
  DEFAULT_MANIFEST_PATH,
  KNOWLEDGE_MANIFEST_SCHEMA_VERSION
} from './constants.js';
import { validateKnowledgeEvidenceBundle } from './knowledge-evidence-bundle.js';
import { validateKnowledgeManifestInvariants } from './knowledge-manifest.js';
import { isPortableRelativePath } from './portable.js';
import { loadProjectManifestInput } from './project-manifest-input.js';

export const DEFAULT_KNOWLEDGE_EVIDENCE_BUNDLE_PATH =
  `${DEFAULT_OUTPUT_DIRECTORY}/knowledge-evidence-bundle.json`;

const knowledgeManifestSchema = JSON.parse(await readFile(
  new URL('../schemas/knowledge-manifest.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateKnowledgeManifestSchema = ajv.compile(knowledgeManifestSchema);

export class VersionAnalysisInputError extends Error {
  constructor(message, code = 'VERSION_ANALYSIS_INPUT_INVALID') {
    super(`Version Analysis input error: ${message}`);
    this.name = 'VersionAnalysisInputError';
    this.code = code;
  }
}

function inputError(message, code) {
  return new VersionAnalysisInputError(message, code);
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function parseJson(bytes, artifactType) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw inputError(`${artifactType} bytes are not valid JSON.`);
  }
}

function artifactFor(source, options, defaultArtifact, artifactType) {
  const artifact = typeof source === 'object' && source !== null && 'bytes' in source
    ? source.artifact
    : options.artifact ?? defaultArtifact;
  if (!isPortableRelativePath(artifact)) {
    throw inputError(`${artifactType} artifact must be a portable repository-relative path.`);
  }
  return artifact;
}

async function readInputBytes(source, artifactType) {
  if (typeof source === 'string' || source instanceof URL) return readFile(source);
  if (source && typeof source === 'object' && 'bytes' in source) {
    if (!(source.bytes instanceof Uint8Array)) {
      throw inputError(`${artifactType} bytes must be a Uint8Array or Buffer.`);
    }
    return Buffer.from(source.bytes);
  }
  throw inputError(`${artifactType} source must be a file path or { bytes, artifact }.`);
}

export async function loadKnowledgeManifestInput(source, options = {}) {
  const artifact = artifactFor(source, options, DEFAULT_KNOWLEDGE_MANIFEST_PATH, 'Knowledge Manifest');
  const bytes = await readInputBytes(source, 'Knowledge Manifest');
  const manifest = parseJson(bytes, 'Knowledge Manifest');

  if (manifest?.schemaVersion !== KNOWLEDGE_MANIFEST_SCHEMA_VERSION) {
    throw inputError(`unsupported Knowledge Manifest schema version; expected ${KNOWLEDGE_MANIFEST_SCHEMA_VERSION}.`);
  }
  if (!validateKnowledgeManifestSchema(manifest)) {
    throw inputError(
      `Knowledge Manifest schema validation failed: ${ajv.errorsText(validateKnowledgeManifestSchema.errors, { separator: '; ' })}`
    );
  }
  const invariantErrors = validateKnowledgeManifestInvariants(manifest);
  if (invariantErrors.length > 0) {
    throw inputError(`Knowledge Manifest runtime invariants failed: ${invariantErrors.join(' ')}`);
  }

  return {
    manifest,
    input: {
      knowledgeManifest: {
        schemaVersion: manifest.schemaVersion,
        artifact,
        artifactDigest: digest(bytes),
        researchId: manifest.research.researchId
      }
    }
  };
}

export async function loadKnowledgeEvidenceBundleInput(source, options = {}) {
  const artifact = artifactFor(source, options, DEFAULT_KNOWLEDGE_EVIDENCE_BUNDLE_PATH, 'Knowledge Evidence Bundle');
  const bytes = await readInputBytes(source, 'Knowledge Evidence Bundle');
  const bundle = parseJson(bytes, 'Knowledge Evidence Bundle');

  if (bundle?.schemaVersion !== '1.0.0') {
    throw inputError('unsupported Knowledge Evidence Bundle schema version; expected 1.0.0.');
  }
  try {
    validateKnowledgeEvidenceBundle(bundle);
  } catch (error) {
    throw inputError(error.message);
  }

  return {
    bundle,
    input: {
      evidenceArtifact: {
        schemaVersion: bundle.schemaVersion,
        artifact,
        artifactDigest: digest(bytes)
      }
    }
  };
}

function assertProjectKnowledgeLineage(projectInput, knowledgeInput, knowledgeManifest) {
  const expected = knowledgeManifest.input.projectManifest;
  const actual = projectInput.projectManifest;
  const mismatches = [];
  if (expected.schemaVersion !== actual.schemaVersion) mismatches.push('Project Manifest schemaVersion');
  if (expected.artifactDigest !== actual.artifactDigest) mismatches.push('Project Manifest artifactDigest');
  if (expected.repository.name !== actual.repository.name) mismatches.push('Project Manifest repository.name');
  if (expected.repository.root !== actual.repository.root) mismatches.push('Project Manifest repository.root');
  if (mismatches.length > 0) {
    throw inputError(`Knowledge Manifest lineage mismatch: ${mismatches.join(', ')}.`, 'LINEAGE_MISMATCH');
  }
}

function assertEvidenceKnowledgeLineage(knowledgeInput, evidenceBundle) {
  const expected = evidenceBundle.input.knowledgeManifest;
  const actual = knowledgeInput.knowledgeManifest;
  const mismatches = [];
  if (expected.schemaVersion !== actual.schemaVersion) mismatches.push('Knowledge Manifest schemaVersion');
  if (expected.artifactDigest !== actual.artifactDigest) mismatches.push('Knowledge Manifest artifactDigest');
  if (expected.researchId !== actual.researchId) mismatches.push('Knowledge Manifest researchId');
  if (mismatches.length > 0) {
    throw inputError(`Knowledge Evidence Bundle lineage mismatch: ${mismatches.join(', ')}.`, 'LINEAGE_MISMATCH');
  }
}

function assertEvidenceReferences(knowledgeManifest, evidenceBundle) {
  const packageIds = new Set(knowledgeManifest.packages.map((item) => item.id));
  const sourceIds = new Set(knowledgeManifest.sources.map((item) => item.id));
  const errors = [];
  for (const item of evidenceBundle.evidence) {
    if (!packageIds.has(item.packageId)) errors.push(`Evidence ${item.id} references unknown package ${item.packageId}.`);
    if (!sourceIds.has(item.sourceId)) errors.push(`Evidence ${item.id} references unknown source ${item.sourceId}.`);
  }
  for (const warning of evidenceBundle.warnings) {
    if (warning.packageId && !packageIds.has(warning.packageId)) {
      errors.push(`Evidence warning ${warning.code} references unknown package ${warning.packageId}.`);
    }
    if (warning.sourceId && !sourceIds.has(warning.sourceId)) {
      errors.push(`Evidence warning ${warning.code} references unknown source ${warning.sourceId}.`);
    }
  }
  if (errors.length > 0) throw inputError(errors.join(' '));
}

export async function loadVersionAnalysisArtifacts(sources, options = {}) {
  const project = await loadProjectManifestInput(
    sources.projectManifest,
    { artifact: options.projectManifestArtifact ?? DEFAULT_MANIFEST_PATH }
  );
  const knowledge = await loadKnowledgeManifestInput(
    sources.knowledgeManifest,
    { artifact: options.knowledgeManifestArtifact ?? DEFAULT_KNOWLEDGE_MANIFEST_PATH }
  );
  const evidence = await loadKnowledgeEvidenceBundleInput(
    sources.evidenceBundle,
    { artifact: options.evidenceBundleArtifact ?? DEFAULT_KNOWLEDGE_EVIDENCE_BUNDLE_PATH }
  );

  assertProjectKnowledgeLineage(project.input, knowledge.input, knowledge.manifest);
  assertEvidenceKnowledgeLineage(knowledge.input, evidence.bundle);
  assertEvidenceReferences(knowledge.manifest, evidence.bundle);

  return {
    projectManifest: project.manifest,
    knowledgeManifest: knowledge.manifest,
    evidenceBundle: evidence.bundle,
    input: {
      projectManifest: project.input.projectManifest,
      knowledgeManifest: knowledge.input.knowledgeManifest,
      evidenceArtifact: evidence.input.evidenceArtifact
    }
  };
}
