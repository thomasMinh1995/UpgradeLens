import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_KNOWLEDGE_MANIFEST_PATH,
  DEFAULT_MANIFEST_PATH,
  DEFAULT_REPOSITORY_IMPACT_EVIDENCE_PATH,
  DEFAULT_REPOSITORY_IMPACT_PATH,
  DEFAULT_USAGE_INDEX_PATH,
  DEFAULT_VERSION_ANALYSIS_PATH
} from '../constants.js';
import { validateRepositoryImpactEvidence } from '../impact-evidence/repository-impact-evidence.js';
import {
  EXACT_SYMBOL_MATCHER_ID,
  EXACT_SYMBOL_MATCHER_VERSION,
  isMatchableUsageSymbol,
  matchFindingToUsage
} from '../impact/matcher.js';
import { validateRepositoryImpact } from '../impact/repository-impact.js';
import { isPortableRelativePath } from '../portable.js';
import { loadProjectManifestInput } from '../project-manifest-input.js';
import { validateUsageIndex } from '../usage/usage-index.js';
import {
  DEFAULT_KNOWLEDGE_EVIDENCE_BUNDLE_PATH,
  loadKnowledgeEvidenceBundleInput,
  loadKnowledgeManifestInput
} from '../version-analysis-loader.js';
import { validateVersionAnalysisManifest } from '../version-analysis-manifest.js';

const ARTIFACTS = Object.freeze([
  Object.freeze({ key: 'projectManifest', label: 'Project Manifest', artifact: DEFAULT_MANIFEST_PATH }),
  Object.freeze({ key: 'knowledgeManifest', label: 'Knowledge Manifest', artifact: DEFAULT_KNOWLEDGE_MANIFEST_PATH }),
  Object.freeze({
    key: 'knowledgeEvidenceBundle',
    label: 'Knowledge Evidence Bundle',
    artifact: DEFAULT_KNOWLEDGE_EVIDENCE_BUNDLE_PATH
  }),
  Object.freeze({ key: 'versionAnalysis', label: 'Version Analysis', artifact: DEFAULT_VERSION_ANALYSIS_PATH }),
  Object.freeze({ key: 'usageIndex', label: 'Usage Index', artifact: DEFAULT_USAGE_INDEX_PATH }),
  Object.freeze({ key: 'repositoryImpact', label: 'Repository Impact', artifact: DEFAULT_REPOSITORY_IMPACT_PATH }),
  Object.freeze({
    key: 'repositoryImpactEvidence',
    label: 'Repository Impact Evidence',
    artifact: DEFAULT_REPOSITORY_IMPACT_EVIDENCE_PATH
  })
]);

const LINEAGE_FIELDS = Object.freeze({
  projectManifest: Object.freeze([
    'schemaVersion',
    'artifact',
    'artifactDigest',
    'repository.name',
    'repository.root'
  ]),
  knowledgeManifest: Object.freeze(['schemaVersion', 'artifact', 'artifactDigest', 'researchId']),
  artifact: Object.freeze(['schemaVersion', 'artifact', 'artifactDigest'])
});

export class MigrationChecklistInputError extends Error {
  constructor(message, code = 'MIGRATION_CHECKLIST_INPUT_INVALID', details = {}) {
    super(`Migration Checklist input error: ${message}`);
    this.name = 'MigrationChecklistInputError';
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(message, code, details) {
  throw new MigrationChecklistInputError(message, code, details);
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function readField(value, field) {
  return field.split('.').reduce((current, segment) => current?.[segment], value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function invocationSources(input, options) {
  if (typeof input === 'string') {
    return { repositoryRoot: input, sources: null, artifacts: options.artifacts ?? {} };
  }
  if (input instanceof URL) {
    const rootUrl = new URL(input);
    if (!rootUrl.pathname.endsWith('/')) rootUrl.pathname = `${rootUrl.pathname}/`;
    return { repositoryRoot: null, sources: null, rootUrl, artifacts: options.artifacts ?? {} };
  }
  if (input === undefined || input === null) {
    return { repositoryRoot: '.', sources: null, artifacts: options.artifacts ?? {} };
  }
  if (typeof input !== 'object') {
    fail('input must be a repository root, URL, or an object containing repositoryRoot or sources.');
  }
  const directSources = ARTIFACTS.some(({ key }) => input[key] !== undefined)
    ? input
    : null;
  const rootUrl = input.repositoryRoot instanceof URL ? new URL(input.repositoryRoot) : null;
  if (rootUrl && !rootUrl.pathname.endsWith('/')) rootUrl.pathname = `${rootUrl.pathname}/`;
  return {
    repositoryRoot: input.repositoryRoot ?? (directSources ? null : '.'),
    rootUrl,
    sources: input.sources ?? directSources,
    artifacts: { ...(options.artifacts ?? {}), ...(input.artifacts ?? {}) }
  };
}

function sourceFor(descriptor, invocation) {
  const alias = descriptor.key === 'knowledgeEvidenceBundle'
    ? invocation.sources?.evidenceBundle
    : undefined;
  const explicit = invocation.sources?.[descriptor.key] ?? alias;
  if (explicit !== undefined) return explicit;
  if (invocation.sources) return undefined;
  if (invocation.rootUrl) return new URL(descriptor.artifact, invocation.rootUrl);
  return path.resolve(invocation.repositoryRoot, descriptor.artifact);
}

function artifactFor(descriptor, source, invocation) {
  const explicitArtifact = source && typeof source === 'object' && !(source instanceof URL)
    ? source.artifact
    : undefined;
  const artifact = explicitArtifact ?? invocation.artifacts[descriptor.key] ?? descriptor.artifact;
  if (!isPortableRelativePath(artifact)) {
    fail(`${descriptor.label} artifact must be a portable repository-relative path.`, 'INVALID_ARTIFACT_PATH');
  }
  return artifact;
}

async function readArtifact(descriptor, source, artifact) {
  if (source === undefined) {
    fail(`${descriptor.label} artifact is required.`, 'MISSING_ARTIFACT', { artifact: descriptor.key });
  }
  try {
    let bytes;
    if (typeof source === 'string' || source instanceof URL) {
      bytes = await readFile(source);
    } else if (source && typeof source === 'object' && source.bytes instanceof Uint8Array) {
      bytes = Buffer.from(source.bytes);
    } else if (source && typeof source === 'object' && (typeof source.path === 'string' || source.path instanceof URL)) {
      bytes = await readFile(source.path);
    } else {
      fail(
        `${descriptor.label} source must be a file path, URL, or { bytes, artifact }.`,
        'INVALID_ARTIFACT_SOURCE',
        { artifact: descriptor.key }
      );
    }
    let value;
    try {
      value = JSON.parse(bytes.toString('utf8'));
    } catch {
      fail(`${descriptor.label} bytes are not valid JSON.`, 'INVALID_JSON', { artifact: descriptor.key });
    }
    return { bytes, artifact, value };
  } catch (error) {
    if (error instanceof MigrationChecklistInputError) throw error;
    if (error?.code === 'ENOENT') {
      fail(`${descriptor.label} artifact is missing.`, 'MISSING_ARTIFACT', { artifact: descriptor.key });
    }
    fail(`${descriptor.label} could not be read.`, 'ARTIFACT_READ_FAILED', { artifact: descriptor.key });
  }
}

function lineageMetadata(records, projectInput, knowledgeInput, bundleInput) {
  const metadata = {
    projectManifest: projectInput.input.projectManifest,
    knowledgeManifest: knowledgeInput.input.knowledgeManifest,
    knowledgeEvidenceBundle: bundleInput.input.evidenceArtifact
  };
  for (const key of ['versionAnalysis', 'usageIndex', 'repositoryImpact', 'repositoryImpactEvidence']) {
    metadata[key] = {
      schemaVersion: records[key].value.schemaVersion,
      artifact: records[key].artifact,
      artifactDigest: digest(records[key].bytes)
    };
  }
  return metadata;
}

function assertLineage(consumer, upstream, expected, actual, fields) {
  for (const field of fields) {
    const expectedValue = readField(expected, field);
    const actualValue = readField(actual, field);
    if (expectedValue !== actualValue) {
      fail(
        `lineage mismatch: ${consumer} declares ${upstream} ${field} as ${String(expectedValue)}; actual value is ${String(actualValue)}.`,
        'LINEAGE_MISMATCH',
        { consumer, upstream, field, expected: expectedValue, actual: actualValue }
      );
    }
  }
}

export function validateMigrationChecklistInputLineage(artifacts) {
  const { input } = artifacts;
  const checks = [
    ['Knowledge Manifest', 'Project Manifest', artifacts.knowledgeManifest.input.projectManifest,
      input.projectManifest, LINEAGE_FIELDS.projectManifest],
    ['Knowledge Evidence Bundle', 'Knowledge Manifest', artifacts.knowledgeEvidenceBundle.input.knowledgeManifest,
      input.knowledgeManifest, LINEAGE_FIELDS.knowledgeManifest],
    ['Version Analysis', 'Project Manifest', artifacts.versionAnalysis.input.projectManifest,
      input.projectManifest, LINEAGE_FIELDS.projectManifest],
    ['Version Analysis', 'Knowledge Manifest', artifacts.versionAnalysis.input.knowledgeManifest,
      input.knowledgeManifest, LINEAGE_FIELDS.knowledgeManifest],
    ['Version Analysis', 'Knowledge Evidence Bundle', artifacts.versionAnalysis.input.evidenceArtifact,
      input.knowledgeEvidenceBundle, LINEAGE_FIELDS.artifact],
    ['Usage Index', 'Project Manifest', artifacts.usageIndex.input.projectManifest,
      input.projectManifest, LINEAGE_FIELDS.projectManifest],
    ['Usage Index', 'Version Analysis', artifacts.usageIndex.input.versionAnalysis,
      input.versionAnalysis, LINEAGE_FIELDS.artifact],
    ['Repository Impact', 'Project Manifest', artifacts.repositoryImpact.input.projectManifest,
      input.projectManifest, LINEAGE_FIELDS.projectManifest],
    ['Repository Impact', 'Version Analysis', artifacts.repositoryImpact.input.versionAnalysis,
      input.versionAnalysis, LINEAGE_FIELDS.artifact],
    ['Repository Impact', 'Usage Index', artifacts.repositoryImpact.input.usageIndex,
      input.usageIndex, LINEAGE_FIELDS.artifact],
    ['Repository Impact Evidence', 'Project Manifest', artifacts.repositoryImpactEvidence.input.projectManifest,
      input.projectManifest, LINEAGE_FIELDS.projectManifest],
    ['Repository Impact Evidence', 'Version Analysis', artifacts.repositoryImpactEvidence.input.versionAnalysis,
      input.versionAnalysis, LINEAGE_FIELDS.artifact],
    ['Repository Impact Evidence', 'Usage Index', artifacts.repositoryImpactEvidence.input.usageIndex,
      input.usageIndex, LINEAGE_FIELDS.artifact],
    ['Repository Impact Evidence', 'Repository Impact', artifacts.repositoryImpactEvidence.input.repositoryImpact,
      input.repositoryImpact, LINEAGE_FIELDS.artifact]
  ];
  for (const check of checks) assertLineage(...check);
  return artifacts;
}

function occurrenceKey(dependency) {
  return [
    dependency.projectId,
    dependency.packageId,
    dependency.manifest,
    dependency.dependencyType,
    dependency.declaredName,
    dependency.versions?.declaredVersion ?? dependency.declaredVersion ?? ''
  ].join('\0');
}

function usageIdentityKey(value) {
  return `${value.projectId}\0${value.packageId}`;
}

function versionResultsByUsageIdentity(results) {
  const indexed = new Map();
  for (const result of results) {
    const key = usageIdentityKey(result.dependency);
    if (!indexed.has(key)) indexed.set(key, []);
    indexed.get(key).push(result);
  }
  return indexed;
}

function validateDependencyIdentities(artifacts) {
  const projects = new Map(artifacts.projectManifest.projects.map((project) => [project.id, project]));
  const packages = new Map(artifacts.knowledgeManifest.packages.map((item) => [item.id, item]));
  const occurrenceOwners = new Set();
  const resultIds = new Set();

  for (const result of artifacts.versionAnalysis.results) {
    const dependency = result.dependency;
    if (resultIds.has(result.id)) {
      fail(`Version Analysis result ${result.id} is duplicated.`, 'AMBIGUOUS_REFERENCE');
    }
    resultIds.add(result.id);
    const project = projects.get(dependency.projectId);
    if (!project) fail(`Version Analysis result ${result.id} references unknown project ${dependency.projectId}.`, 'REFERENCE_MISMATCH');
    const declared = project.dependencies.filter((item) => (
      item.name === dependency.declaredName
      && item.normalizedName === dependency.normalizedName
      && item.declaredVersion === result.versions.declaredVersion
      && item.type === dependency.dependencyType
      && item.manifest === dependency.manifest
    ));
    if (declared.length !== 1 || project.ecosystem !== dependency.ecosystem) {
      fail(`Version Analysis result ${result.id} does not match one exact Project Manifest dependency occurrence.`, 'REFERENCE_MISMATCH');
    }
    const packageRecord = packages.get(dependency.packageId);
    if (!packageRecord
        || packageRecord.ecosystem !== dependency.ecosystem
        || packageRecord.identity.normalizedName !== dependency.normalizedName
        || packageRecord.identity.registry !== dependency.registry) {
      fail(`Version Analysis result ${result.id} does not match Knowledge package ${dependency.packageId}.`, 'REFERENCE_MISMATCH');
    }
    const occurrences = packageRecord.occurrences.filter((item) => (
      item.projectId === dependency.projectId
      && item.projectPath === project.path
      && item.manifest === dependency.manifest
      && item.dependencyType === dependency.dependencyType
      && item.declaredName === dependency.declaredName
      && item.declaredVersion === result.versions.declaredVersion
    ));
    if (occurrences.length !== 1) {
      fail(`Version Analysis result ${result.id} does not match one exact Knowledge occurrence.`, 'REFERENCE_MISMATCH');
    }
    const key = occurrenceKey({ ...dependency, versions: result.versions });
    if (occurrenceOwners.has(key)) {
      fail(`Version Analysis occurrence for ${dependency.projectId}/${dependency.packageId} is ambiguous.`, 'AMBIGUOUS_REFERENCE');
    }
    occurrenceOwners.add(key);
  }
}

function validateEvidenceReferences(artifacts) {
  const bundleEvidence = new Map(artifacts.knowledgeEvidenceBundle.evidence.map((item) => [item.id, item]));
  const sources = new Map(artifacts.knowledgeManifest.sources.map((item) => [item.id, item]));
  const packages = new Map(artifacts.knowledgeManifest.packages.map((item) => [item.id, item]));

  for (const item of artifacts.knowledgeEvidenceBundle.evidence) {
    const packageRecord = packages.get(item.packageId);
    const source = sources.get(item.sourceId);
    if (!packageRecord || !source || !packageRecord.sourceIds.includes(item.sourceId)) {
      fail(`Knowledge evidence ${item.id} has cross-package or unknown provenance.`, 'REFERENCE_MISMATCH');
    }
  }

  for (const result of artifacts.versionAnalysis.results) {
    const resultEvidence = new Map(result.evidence.map((item) => [item.id, item]));
    const findingIds = new Set();
    for (const finding of result.findings) {
      if (findingIds.has(finding.id)) {
        fail(`Version Analysis result ${result.id} has duplicate finding ${finding.id}.`, 'AMBIGUOUS_REFERENCE');
      }
      findingIds.add(finding.id);
      for (const ref of finding.evidenceRefs) {
        if (!resultEvidence.has(ref)) {
          fail(`Finding ${result.id}/${finding.id} references unknown Version Analysis evidence ${ref}.`, 'REFERENCE_MISMATCH');
        }
      }
    }
    for (const evidence of result.evidence) {
      const bundled = bundleEvidence.get(evidence.id);
      const source = sources.get(evidence.sourceId);
      if (!bundled || bundled.packageId !== result.dependency.packageId || !source) {
        fail(`Version Analysis evidence ${evidence.id} has cross-package or unknown provenance.`, 'REFERENCE_MISMATCH');
      }
      const expected = {
        id: bundled.id,
        kind: bundled.kind,
        sourceId: bundled.sourceId,
        sourceUrl: source.url,
        authority: source.authority,
        trust: source.trust,
        retrievedAt: bundled.retrievedAt,
        contentDigest: bundled.contentDigest,
        locator: bundled.locator,
        releaseVersions: bundled.releaseVersions
      };
      if (!sameJson(evidence, expected)) {
        fail(`Version Analysis evidence ${evidence.id} does not exactly match Knowledge evidence metadata.`, 'REFERENCE_MISMATCH');
      }
    }
  }
}

function validateUsageReferences(artifacts) {
  const results = versionResultsByUsageIdentity(artifacts.versionAnalysis.results);
  for (const usage of artifacts.usageIndex.dependencies) {
    const matching = results.get(usageIdentityKey(usage)) ?? [];
    if (matching.length === 0
        || matching.some((result) => result.dependency.declaredName !== usage.name)) {
      fail(`Usage Index dependency ${usage.projectId}/${usage.packageId} has no exact Version Analysis identity.`, 'REFERENCE_MISMATCH');
    }
  }
}

function validateImpactReferences(artifacts) {
  if (artifacts.repositoryImpact.analysis.matcher.id !== EXACT_SYMBOL_MATCHER_ID
      || artifacts.repositoryImpact.analysis.matcher.version !== EXACT_SYMBOL_MATCHER_VERSION) {
    fail(
      `Repository Impact matcher must be ${EXACT_SYMBOL_MATCHER_ID}@${EXACT_SYMBOL_MATCHER_VERSION}.`,
      'MATCHER_UNSUPPORTED'
    );
  }
  const results = new Map(artifacts.versionAnalysis.results.map((result) => [result.id, result]));
  const usages = new Map(artifacts.usageIndex.dependencies.map((usage) => (
    [`${usage.projectId}\0${usage.packageId}`, usage]
  )));
  const seen = new Set();
  for (const dependency of artifacts.repositoryImpact.dependencies) {
    const result = results.get(dependency.analysisResultId);
    if (!result || seen.has(dependency.analysisResultId)) {
      fail(`Repository Impact has unknown or duplicate result ${dependency.analysisResultId}.`, 'REFERENCE_MISMATCH');
    }
    seen.add(dependency.analysisResultId);
    if (dependency.projectId !== result.dependency.projectId
        || dependency.packageId !== result.dependency.packageId
        || dependency.name !== result.dependency.declaredName) {
      fail(`Repository Impact identity differs for result ${dependency.analysisResultId}.`, 'REFERENCE_MISMATCH');
    }
    const expectedFindings = result.findings.filter((finding) => finding.kind === 'breakingChange');
    if (dependency.findings.length !== expectedFindings.length) {
      fail(`Repository Impact finding count differs for result ${dependency.analysisResultId}.`, 'REFERENCE_MISMATCH');
    }
    const usage = usages.get(`${dependency.projectId}\0${dependency.packageId}`) ?? null;
    const impacts = new Map(dependency.findings.map((finding) => [finding.id, finding]));
    for (const finding of expectedFindings) {
      const impact = impacts.get(finding.id);
      const expectedMatches = matchFindingToUsage(finding, usage);
      if (!impact
          || impact.kind !== finding.kind
          || impact.summary !== finding.summary
          || impact.impacted !== (expectedMatches.length > 0)
          || !sameJson(impact.matches, expectedMatches)) {
        fail(`Repository Impact finding ${dependency.analysisResultId}/${finding.id} is inconsistent with Version Analysis or Usage Index.`, 'REFERENCE_MISMATCH');
      }
    }
  }
  if (seen.size !== results.size) {
    fail('Repository Impact does not contain every Version Analysis result exactly once.', 'REFERENCE_MISMATCH');
  }
}

function expectedMatchedSymbols(impactFinding) {
  return impactFinding.matches.map((match) => ({
    symbol: match.symbol,
    usages: match.files.map((file) => ({ file }))
  }));
}

function expectedImpactEvidenceReason(impactFinding, usage) {
  if (impactFinding.impacted) return 'EXACT_SYMBOL_USAGE_FOUND';
  if (!usage) return 'DEPENDENCY_NOT_USED';
  if (!usage.symbols.some((symbol) => isMatchableUsageSymbol(symbol.name))) {
    return 'NO_MATCHABLE_SYMBOL_FOUND';
  }
  return 'NO_EXACT_SYMBOL_USAGE_FOUND';
}

function validateImpactEvidenceReferences(artifacts) {
  const impacts = new Map(artifacts.repositoryImpact.dependencies.map((dependency) => [dependency.analysisResultId, dependency]));
  const usages = new Map(artifacts.usageIndex.dependencies.map((usage) => (
    [`${usage.projectId}\0${usage.packageId}`, usage]
  )));
  const seen = new Set();
  for (const dependency of artifacts.repositoryImpactEvidence.dependencies) {
    const impact = impacts.get(dependency.analysisResultId);
    if (!impact || seen.has(dependency.analysisResultId)) {
      fail(`Repository Impact Evidence has unknown or duplicate result ${dependency.analysisResultId}.`, 'REFERENCE_MISMATCH');
    }
    seen.add(dependency.analysisResultId);
    if (dependency.projectId !== impact.projectId
        || dependency.packageId !== impact.packageId
        || dependency.name !== impact.name
        || dependency.impacted !== impact.impacted
        || dependency.findings.length !== impact.findings.length) {
      fail(`Repository Impact Evidence identity differs for result ${dependency.analysisResultId}.`, 'REFERENCE_MISMATCH');
    }
    const evidenceFindings = new Map(dependency.findings.map((finding) => [finding.findingId, finding]));
    const usage = usages.get(`${dependency.projectId}\0${dependency.packageId}`) ?? null;
    for (const finding of impact.findings) {
      const evidence = evidenceFindings.get(finding.id);
      if (!evidence
          || evidence.kind !== finding.kind
          || evidence.summary !== finding.summary
          || evidence.impacted !== finding.impacted
          || evidence.reasonCode !== expectedImpactEvidenceReason(finding, usage)
          || !sameJson(evidence.matchedSymbols, expectedMatchedSymbols(finding))) {
        fail(`Repository Impact Evidence location ${dependency.analysisResultId}/${finding.id} is inconsistent with Repository Impact.`, 'REFERENCE_MISMATCH');
      }
    }
  }
  if (seen.size !== impacts.size) {
    fail('Repository Impact Evidence does not contain every Repository Impact result exactly once.', 'REFERENCE_MISMATCH');
  }
}

export function validateMigrationChecklistInputReferences(artifacts) {
  validateDependencyIdentities(artifacts);
  validateEvidenceReferences(artifacts);
  validateUsageReferences(artifacts);
  validateImpactReferences(artifacts);
  validateImpactEvidenceReferences(artifacts);
  return artifacts;
}

async function validateParsedArtifacts(records) {
  let projectInput;
  let knowledgeInput;
  let bundleInput;
  try {
    [projectInput, knowledgeInput, bundleInput] = await Promise.all([
      loadProjectManifestInput(
        { bytes: records.projectManifest.bytes, artifact: records.projectManifest.artifact }
      ),
      loadKnowledgeManifestInput(
        { bytes: records.knowledgeManifest.bytes, artifact: records.knowledgeManifest.artifact }
      ),
      loadKnowledgeEvidenceBundleInput(
        { bytes: records.knowledgeEvidenceBundle.bytes, artifact: records.knowledgeEvidenceBundle.artifact }
      )
    ]);
    validateVersionAnalysisManifest(records.versionAnalysis.value);
    validateUsageIndex(records.usageIndex.value);
    validateRepositoryImpact(records.repositoryImpact.value);
    validateRepositoryImpactEvidence(records.repositoryImpactEvidence.value);
  } catch (error) {
    if (error instanceof MigrationChecklistInputError) throw error;
    fail(error.message, error.code ?? 'ARTIFACT_VALIDATION_FAILED');
  }
  return { projectInput, knowledgeInput, bundleInput };
}

/** Load, schema-validate, and cross-check the seven immutable MVP-05 inputs. */
export async function loadMigrationChecklistInputs(input, options = {}) {
  const invocation = invocationSources(input, options);
  const records = {};
  for (const descriptor of ARTIFACTS) {
    const source = sourceFor(descriptor, invocation);
    const artifact = artifactFor(descriptor, source, invocation);
    records[descriptor.key] = await readArtifact(descriptor, source, artifact);
  }
  const { projectInput, knowledgeInput, bundleInput } = await validateParsedArtifacts(records);
  const artifacts = {
    projectManifest: projectInput.manifest,
    knowledgeManifest: knowledgeInput.manifest,
    knowledgeEvidenceBundle: bundleInput.bundle,
    versionAnalysis: records.versionAnalysis.value,
    usageIndex: records.usageIndex.value,
    repositoryImpact: records.repositoryImpact.value,
    repositoryImpactEvidence: records.repositoryImpactEvidence.value,
    input: lineageMetadata(records, projectInput, knowledgeInput, bundleInput)
  };
  validateMigrationChecklistInputLineage(artifacts);
  validateMigrationChecklistInputReferences(artifacts);
  return deepFreeze(structuredClone(artifacts));
}
