import { createHash } from 'node:crypto';

import { canonicalJson, canonicalJsonBytes } from './canonical-json.js';
import {
  createDefaultEcosystemVersionAdapterRegistry,
  getEcosystemVersionAdapter
} from './ecosystem-version-adapter.js';
import { compareText } from './portable.js';
import { VersionAnalysisInputError } from './version-analysis-loader.js';

export const DEPENDENCY_AI_CONTEXT_VERSION = '1';

const KIND_PRIORITY = new Map([
  ['breakingChanges', 0],
  ['migrationGuide', 1],
  ['compatibility', 2],
  ['deprecations', 3],
  ['releaseNotes', 4],
  ['changelog', 5],
  ['registryFact', 6]
]);
const AUTHORITY_PRIORITY = new Map([
  ['officialProject', 0],
  ['publisherProvided', 1],
  ['registryAuthoritative', 2],
  ['community', 9]
]);
const TRUST_PRIORITY = new Map([
  ['official', 0],
  ['publisher', 1],
  ['verified', 2],
  ['unknown', 8],
  ['community', 9]
]);
const UNVERSIONED_TARGET_KINDS = new Set(['migrationGuide', 'compatibility', 'changelog']);

function digestBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function digestText(value) {
  return digestBytes(Buffer.from(value, 'utf8'));
}

function inputError(message, code) {
  return new VersionAnalysisInputError(message, code);
}

function occurrenceKey(occurrence) {
  return [
    occurrence.projectId,
    occurrence.manifest,
    occurrence.dependencyType,
    occurrence.declaredName,
    occurrence.declaredVersion ?? ''
  ].join('\0');
}

function projectDependencyKey(project, dependency) {
  return [
    project.id,
    dependency.manifest,
    dependency.type,
    dependency.name,
    dependency.declaredVersion ?? ''
  ].join('\0');
}

function dependencyMatchesSelector(project, dependency, selector = {}) {
  if (selector.projectId && selector.projectId !== project.id) return false;
  if (selector.manifest && selector.manifest !== dependency.manifest) return false;
  if (selector.dependencyType && selector.dependencyType !== dependency.type) return false;
  if (selector.declaredName && selector.declaredName !== dependency.name) return false;
  if ('declaredVersion' in selector && selector.declaredVersion !== dependency.declaredVersion) return false;
  return true;
}

function packageForDependency(knowledgeManifest, project, dependency) {
  const key = projectDependencyKey(project, dependency);
  const matches = knowledgeManifest.packages.filter((packageRecord) =>
    packageRecord.ecosystem === project.ecosystem
    && packageRecord.occurrences.some((occurrence) => occurrenceKey(occurrence) === key)
  );
  if (matches.length !== 1) {
    throw inputError(
      `Expected exactly one Knowledge package for dependency ${dependency.name} in ${project.id}; found ${matches.length}.`
    );
  }
  return matches[0];
}

export function resolveDependencyAnalysisInput(artifacts, selector = {}) {
  const matches = [];
  for (const project of artifacts.projectManifest.projects) {
    if (project.dependencySummary.status !== 'parsed') continue;
    for (const dependency of project.dependencies) {
      if (dependencyMatchesSelector(project, dependency, selector)) {
        matches.push({ project, dependency });
      }
    }
  }
  if (matches.length !== 1) {
    throw inputError(`Expected exactly one dependency occurrence; found ${matches.length}.`);
  }
  const { project, dependency } = matches[0];
  const packageRecord = packageForDependency(artifacts.knowledgeManifest, project, dependency);
  return { project, dependency, packageRecord };
}

export function resolveDependencyAnalysisInputs(artifacts) {
  return artifacts.projectManifest.projects
    .filter((project) => project.dependencySummary.status === 'parsed')
    .flatMap((project) => project.dependencies.map((dependency) => ({
      project,
      dependency,
      packageRecord: packageForDependency(artifacts.knowledgeManifest, project, dependency)
    })))
    .sort((left, right) => compareText(projectDependencyKey(left.project, left.dependency), projectDependencyKey(right.project, right.dependency)));
}

export function resolveVersionBaseline(adapter, dependency, options = {}) {
  if (options.currentVersion !== undefined && options.currentVersion !== null) {
    const normalized = adapter.normalizeVersion(options.currentVersion);
    if (!normalized.ok) throw inputError(`Explicit current version is invalid: ${normalized.reason}.`, 'BASELINE_UNSUPPORTED');
    return {
      analysisMode: 'exactBaseline',
      currentVersion: normalized.value,
      currentVersionSource: 'explicit',
      declaredConstraint: null
    };
  }

  const baseline = adapter.resolveDeclaredBaseline(dependency.declaredVersion);
  if (baseline.kind === 'exactVersion') {
    return {
      analysisMode: 'exactBaseline',
      currentVersion: baseline.version,
      currentVersionSource: 'exactDeclaration',
      declaredConstraint: null
    };
  }
  if (baseline.kind === 'declaredConstraint') {
    return {
      analysisMode: 'declaredConstraint',
      currentVersion: null,
      currentVersionSource: null,
      declaredConstraint: baseline.constraint
    };
  }
  throw inputError(`Dependency ${dependency.name} has unsupported baseline: ${baseline.reason}.`, 'BASELINE_UNSUPPORTED');
}

export function resolveTargetVersion(adapter, packageRecord, request = {}) {
  const policy = request.policy ?? (request.version ? 'explicit' : 'registryLatest');
  if (policy === 'explicit') {
    const normalized = adapter.normalizeVersion(request.version);
    if (!normalized.ok) throw inputError(`Explicit target version is invalid: ${normalized.reason}.`, 'TARGET_INVALID');
    return { targetVersion: normalized.value, targetPolicy: 'explicit' };
  }
  if (policy === 'registryLatest') {
    if (!packageRecord.latest?.version) {
      throw inputError(`Package ${packageRecord.id} has no registry latest target.`, 'TARGET_INVALID');
    }
    const normalized = adapter.normalizeVersion(packageRecord.latest.version);
    if (!normalized.ok) throw inputError(`Registry latest version is invalid: ${normalized.reason}.`, 'TARGET_INVALID');
    return { targetVersion: normalized.value, targetPolicy: 'registryLatest' };
  }
  throw inputError(`Unsupported target policy ${policy}.`, 'TARGET_INVALID');
}

function sourceRank(source) {
  return [
    AUTHORITY_PRIORITY.get(source.authority) ?? 8,
    TRUST_PRIORITY.get(source.trust) ?? 8
  ];
}

function relevantVersionSet(relevantReleases, targetVersion) {
  const versions = new Set(relevantReleases.map((release) => release.version).filter(Boolean));
  versions.add(targetVersion);
  return versions;
}

function itemIsRelevant(item, versions, mode) {
  if (item.releaseVersions.length > 0) {
    return item.releaseVersions.some((version) => versions.has(version));
  }
  return mode === 'declaredConstraint' && UNVERSIONED_TARGET_KINDS.has(item.kind);
}

function compareSelectedEvidence(left, right) {
  const leftRank = left.rank;
  const rightRank = right.rank;
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] !== rightRank[index]) return leftRank[index] < rightRank[index] ? -1 : 1;
  }
  return compareText(left.item.id, right.item.id);
}

function compareWarnings(left, right) {
  return compareText(left.packageId ?? '', right.packageId ?? '')
    || compareText(left.sourceId ?? '', right.sourceId ?? '')
    || compareText(left.code, right.code)
    || compareText((left.conflictSourceIds ?? []).join('\0'), (right.conflictSourceIds ?? []).join('\0'))
    || compareText(left.message, right.message);
}

function warningKey(warning) {
  return [
    warning.code,
    warning.packageId ?? '',
    warning.sourceId ?? '',
    (warning.conflictSourceIds ?? []).join('\0'),
    warning.message
  ].join('\0');
}

function addWarning(warnings, warning) {
  const normalized = {
    ...warning,
    ...(warning.conflictSourceIds
      ? { conflictSourceIds: [...warning.conflictSourceIds].sort(compareText) }
      : {})
  };
  if (!warnings.some((item) => warningKey(item) === warningKey(normalized))) {
    warnings.push(normalized);
  }
}

function addSelectedSourceConflictWarnings(warnings, input, bounded) {
  for (const { source } of bounded) {
    if ((source.conflictsWith ?? []).length === 0) continue;
    addWarning(warnings, {
      code: 'SOURCE_CONFLICT',
      packageId: input.packageRecord.id,
      sourceId: source.id,
      conflictSourceIds: source.conflictsWith,
      message: `Source ${source.id} conflicts with another source for ${input.packageRecord.id}.`
    });
  }
}

function addArtifactSourceConflictWarnings(warnings, artifacts, input, bounded) {
  const selectedSourceIds = new Set(bounded.map(({ source }) => source.id));
  const packageHasConflict = input.packageRecord.warningCodes?.includes('SOURCE_CONFLICT') ?? false;
  const conflictWarnings = [
    ...(artifacts.knowledgeManifest.warnings ?? []),
    ...(artifacts.evidenceBundle.warnings ?? [])
  ].filter((warning) =>
    warning.code === 'SOURCE_CONFLICT'
    && warning.packageId === input.packageRecord.id
    && (
      packageHasConflict
      || !warning.sourceId
      || selectedSourceIds.has(warning.sourceId)
    )
  );

  for (const warning of conflictWarnings) {
    addWarning(warnings, {
      code: 'SOURCE_CONFLICT',
      packageId: input.packageRecord.id,
      ...(warning.sourceId ? { sourceId: warning.sourceId } : {}),
      message: warning.message
    });
  }

  if (packageHasConflict && conflictWarnings.length === 0) {
    addWarning(warnings, {
      code: 'SOURCE_CONFLICT',
      packageId: input.packageRecord.id,
      message: `Package ${input.packageRecord.id} has unresolved source conflicts.`
    });
  }
}

export function selectEvidence(artifacts, input, selection, options = {}) {
  const maxItems = options.maxEvidenceItems ?? 8;
  const maxCharacters = options.maxEvidenceCharacters ?? 12000;
  const sourcesById = new Map(artifacts.knowledgeManifest.sources.map((source) => [source.id, source]));
  const versions = relevantVersionSet(selection.relevantReleases, selection.targetVersion);
  const warnings = [];
  const selected = [];
  const seenContent = new Set();

  for (const item of artifacts.evidenceBundle.evidence) {
    if (item.packageId !== input.packageRecord.id) continue;
    const source = sourcesById.get(item.sourceId);
    if (!source) continue;
    if (source.authority === 'community' || source.trust === 'community') continue;
    if (!['available', 'stale'].includes(source.status)) continue;
    if (item.contentDigest !== digestText(item.content)) continue;
    if (!itemIsRelevant(item, versions, selection.analysisMode)) continue;
    if (seenContent.has(item.contentDigest)) continue;
    seenContent.add(item.contentDigest);
    if (source.status === 'stale') {
      warnings.push({ code: 'SOURCE_STALE', sourceId: source.id, message: `Source ${source.id} is stale.` });
    }
    const [authorityRank, trustRank] = sourceRank(source);
    const releaseRank = item.releaseVersions.length === 0
      ? Number.MAX_SAFE_INTEGER
      : Math.min(...item.releaseVersions.map((version) => [...versions].indexOf(version)).filter((index) => index >= 0));
    selected.push({
      item,
      source,
      rank: [
        releaseRank,
        KIND_PRIORITY.get(item.kind) ?? 99,
        authorityRank,
        trustRank
      ]
    });
  }

  selected.sort(compareSelectedEvidence);
  const bounded = [];
  let characters = 0;
  for (const record of selected) {
    if (bounded.length >= maxItems) break;
    if (characters + record.item.content.length > maxCharacters) continue;
    characters += record.item.content.length;
    bounded.push(record);
  }

  addSelectedSourceConflictWarnings(warnings, input, bounded);
  addArtifactSourceConflictWarnings(warnings, artifacts, input, bounded);

  if (bounded.length === 0) {
    warnings.push({
      code: 'EVIDENCE_MISSING',
      packageId: input.packageRecord.id,
      message: `No selected evidence for ${input.packageRecord.id}.`
    });
  }

  return {
    evidence: bounded.map(({ item, source }) => ({
      id: item.id,
      kind: item.kind,
      sourceId: item.sourceId,
      sourceUrl: source.url,
      authority: source.authority,
      trust: source.trust,
      retrievedAt: item.retrievedAt,
      contentDigest: item.contentDigest,
      locator: item.locator,
      releaseVersions: [...item.releaseVersions],
      content: item.content
    })),
    warnings: warnings.sort(compareWarnings)
  };
}

function normalizeRelevantReleases(releases) {
  return releases.map((release) => release.version).filter(Boolean);
}

function buildContextWithoutId(artifacts, input, versions, knowledge, metadata) {
  return {
    contextVersion: DEPENDENCY_AI_CONTEXT_VERSION,
    lineage: {
      projectManifestDigest: artifacts.input.projectManifest.artifactDigest,
      knowledgeManifestDigest: artifacts.input.knowledgeManifest.artifactDigest,
      knowledgeResearchId: artifacts.input.knowledgeManifest.researchId,
      evidenceArtifactDigest: artifacts.input.evidenceArtifact.artifactDigest
    },
    dependency: {
      projectId: input.project.id,
      packageId: input.packageRecord.id,
      declaredName: input.dependency.name,
      normalizedName: input.packageRecord.identity.normalizedName,
      ecosystem: input.project.ecosystem,
      registry: input.packageRecord.identity.registry,
      packageManager: input.project.packageManager?.name ?? null,
      dependencyType: input.dependency.type,
      manifest: input.dependency.manifest
    },
    versions,
    knowledge,
    metadata
  };
}

export function buildDependencyAiContext(artifacts, request = {}) {
  const registry = request.adapterRegistry ?? createDefaultEcosystemVersionAdapterRegistry();
  const input = request.input ?? resolveDependencyAnalysisInput(artifacts, request.dependency ?? {});
  const adapter = getEcosystemVersionAdapter(input.project.ecosystem, registry);
  const baseline = resolveVersionBaseline(adapter, input.dependency, { currentVersion: request.currentVersion });
  const target = resolveTargetVersion(adapter, input.packageRecord, request.target ?? { policy: 'explicit', version: request.targetVersion });
  const delta = baseline.analysisMode === 'exactBaseline'
    ? adapter.compareVersions(baseline.currentVersion, target.targetVersion)
    : { direction: 'unknown', classification: 'unknown' };
  const relevantReleases = adapter.selectRelevantReleases(input.packageRecord.releaseIndex, {
    mode: baseline.analysisMode,
    current: baseline.currentVersion,
    target: target.targetVersion
  });
  const selected = selectEvidence(artifacts, input, {
    analysisMode: baseline.analysisMode,
    relevantReleases,
    targetVersion: target.targetVersion
  }, request.evidencePolicy);
  const missingInformation = selected.evidence.length === 0 ? ['evidence'] : [];
  const versions = {
    analysisMode: baseline.analysisMode,
    declaredVersion: input.dependency.declaredVersion,
    currentVersion: baseline.currentVersion,
    currentVersionSource: baseline.currentVersionSource,
    targetVersion: target.targetVersion,
    targetPolicy: target.targetPolicy,
    delta
  };
  const knowledge = {
    relevantReleases: normalizeRelevantReleases(relevantReleases),
    evidence: selected.evidence
  };
  const metadata = {
    selectedEvidenceIds: selected.evidence.map((item) => item.id).sort(compareText),
    missingInformation,
    warnings: selected.warnings,
    size: {
      characters: 0,
      evidenceItems: selected.evidence.length
    }
  };
  const contextWithoutSize = buildContextWithoutId(artifacts, input, versions, knowledge, metadata);
  const characters = canonicalJson(contextWithoutSize).length;
  const contextMaterial = buildContextWithoutId(artifacts, input, versions, knowledge, {
    ...metadata,
    size: { ...metadata.size, characters }
  });
  const contextId = digestBytes(canonicalJsonBytes(contextMaterial));
  return { contextId, ...contextMaterial };
}

export function dependencyAiContextDigest(context) {
  const { contextId, ...material } = context;
  return digestBytes(canonicalJsonBytes(material));
}

export function dependencyAiContextsEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}
