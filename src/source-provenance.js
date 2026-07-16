import { createHash } from 'node:crypto';

import { compareText, isSorted } from './portable.js';
import { canonicalizeSourceUrl, isCanonicalPublicSourceUrl } from './source-url.js';

const ROLE_ALIASES = new Map([
  ['homepage', 'homepage'],
  ['documentation', 'documentation'],
  ['repository', 'repository'],
  ['sourcerepository', 'repository'],
  ['issues', 'issues'],
  ['issuetracker', 'issues'],
  ['changelog', 'changelog'],
  ['releasenotes', 'releaseNotes'],
  ['releases', 'releases'],
  ['releasefeed', 'releases'],
  ['migration', 'migrationGuide'],
  ['migrationguide', 'migrationGuide'],
  ['upgradeguide', 'migrationGuide'],
  ['community', 'community']
]);

const ROLE_DETAILS = {
  homepage: { group: 'documentation', kind: 'officialDocumentation' },
  documentation: { group: 'documentation', kind: 'officialDocumentation' },
  repository: { group: 'repository', kind: 'sourceRepository' },
  issues: { group: 'issues', kind: 'sourceRepository' },
  changelog: { group: 'changelog', kind: 'officialDocumentation' },
  releaseNotes: { group: 'releaseNotes', kind: 'officialDocumentation' },
  releases: { group: 'releaseFeed', kind: 'releaseFeed' },
  migrationGuide: { group: 'migrationGuide', kind: 'officialDocumentation' },
  community: { group: 'community', kind: 'community' }
};

const SOURCE_KINDS = new Set(['registry', 'officialDocumentation', 'sourceRepository', 'releaseFeed', 'community']);
const AUTHORITIES = new Set(['registryAuthoritative', 'officialProject', 'publisherProvided', 'community']);
const TRUSTS = new Set(['official', 'publisher', 'verified', 'community', 'unknown']);
const STATUSES = new Set(['available', 'notFound', 'unavailable', 'unverified', 'stale']);

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function sourceIdFor(packageId, group, url) {
  return `${packageId}:${group}:${digest(url)}`;
}

function comparableWarning(left, right) {
  return compareText(left.packageId, right.packageId)
    || compareText(left.code, right.code)
    || compareText(left.sourceId, right.sourceId)
    || compareText(left.message, right.message);
}

function normalizeRole(value) {
  if (typeof value !== 'string') return null;
  return ROLE_ALIASES.get(value.replace(/[\s_-]/g, '').toLowerCase()) ?? null;
}

function inputPackage(result) {
  return result?.package ?? result;
}

function registrySource(result) {
  return result?.source ?? null;
}

function candidateFromMetadata(packageRecord, sourceId) {
  const metadata = packageRecord.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  return [
    ['homepage', 'homepageUrl'],
    ['documentation', 'documentationUrl'],
    ['repository', 'repositoryUrl'],
    ['issues', 'issueUrl']
  ].flatMap(([role, field]) => typeof metadata[field] === 'string'
    ? [{ role, url: metadata[field], discoveredFromSourceId: sourceId, discoveredFromField: `metadata.${field}` }]
    : []);
}

function candidatesFromResult(result, packageRecord, sourceId) {
  const candidates = candidateFromMetadata(packageRecord, sourceId);
  for (const candidate of Array.isArray(result?.sourceCandidates) ? result.sourceCandidates : []) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    candidates.push({
      role: candidate.role,
      url: candidate.url,
      discoveredFromSourceId: candidate.discoveredFromSourceId ?? sourceId,
      discoveredFromField: candidate.discoveredFromField ?? 'sourceCandidates'
    });
  }
  return candidates;
}

function cloneSource(source) {
  return structuredClone(source);
}

function sourceInputIsValid(source, packageId) {
  return source && typeof source === 'object' && !Array.isArray(source)
    && typeof source.id === 'string' && source.id.startsWith(`${packageId}:registry`)
    && source.kind === 'registry';
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function candidateComparator(left, right) {
  return compareText(left.packageId, right.packageId)
    || compareText(left.sourceId, right.sourceId)
    || compareText(left.discoveredFromSourceId, right.discoveredFromSourceId)
    || compareText(left.discoveredFromField, right.discoveredFromField)
    || compareText(left.role, right.role);
}

function provenanceComparator(left, right) {
  return compareText(left.discoveredFromSourceId, right.discoveredFromSourceId)
    || compareText(left.discoveredFromField, right.discoveredFromField)
    || compareText(left.role, right.role);
}

function conflictMessage(packageId, role) {
  return `Multiple publisher-provided ${role} sources were found for ${packageId}.`;
}

/**
 * Build the small, internal provenance graph used before Knowledge Manifest
 * assembly. It is deliberately package-scoped: equal URLs from unrelated
 * package identities do not assert an equivalence relationship.
 */
export function resolveSourceProvenance(adapterResults) {
  if (!Array.isArray(adapterResults)) {
    throw new Error('Source provenance resolution requires an array of adapter results.');
  }

  const packages = new Map();
  const sources = new Map();
  const candidates = [];

  for (const result of adapterResults) {
    const packageRecord = inputPackage(result);
    const packageId = packageRecord?.id ?? result?.packageId;
    const source = registrySource(result);
    if (typeof packageId !== 'string' || !sourceInputIsValid(source, packageId)) {
      throw new Error('Source provenance input must contain a package id and its registry source.');
    }
    if (!packages.has(packageId)) packages.set(packageId, new Set());
    packages.get(packageId).add(source.id);
    const cloned = cloneSource(source);
    if (sources.has(cloned.id) && !sameJson(sources.get(cloned.id), cloned)) {
      throw new Error(`Source provenance input contains conflicting registry source ${cloned.id}.`);
    }
    sources.set(cloned.id, cloned);

    for (const rawCandidate of candidatesFromResult(result, packageRecord, source.id)) {
      const role = normalizeRole(rawCandidate.role);
      const details = role ? ROLE_DETAILS[role] : null;
      const url = details ? canonicalizeSourceUrl(rawCandidate.url, { role }) : null;
      const discoveredFromSourceId = typeof rawCandidate.discoveredFromSourceId === 'string'
        && sources.has(rawCandidate.discoveredFromSourceId)
        ? rawCandidate.discoveredFromSourceId
        : source.id;
      if (!details || !url) continue;
      candidates.push({
        packageId,
        role,
        group: details.group,
        kind: details.kind,
        url,
        sourceId: sourceIdFor(packageId, details.group, url),
        discoveredFromSourceId,
        discoveredFromField: typeof rawCandidate.discoveredFromField === 'string'
          ? rawCandidate.discoveredFromField
          : 'sourceCandidates'
      });
    }
  }

  const generated = new Map();
  for (const candidate of candidates.sort(candidateComparator)) {
    if (!generated.has(candidate.sourceId)) {
      generated.set(candidate.sourceId, {
        packageId: candidate.packageId,
        id: candidate.sourceId,
        kind: candidate.kind,
        authority: candidate.role === 'community' ? 'community' : 'publisherProvided',
        trust: candidate.role === 'community' ? 'community' : 'publisher',
        url: candidate.url,
        status: 'unverified',
        supports: new Set(),
        provenance: [],
        conflictsWith: new Set()
      });
    }
    const record = generated.get(candidate.sourceId);
    record.supports.add(candidate.role);
    record.provenance.push(candidate);
  }

  for (const record of generated.values()) {
    const provenance = record.provenance.sort(provenanceComparator);
    const evidence = sortedUnique(provenance.map((item) => item.discoveredFromSourceId));
    const independentRegistryEvidence = evidence.filter((id) => sources.get(id)?.kind === 'registry');
    if (record.authority === 'publisherProvided' && independentRegistryEvidence.length >= 2) {
      record.trust = 'verified';
    }
    const source = {
      id: record.id,
      kind: record.kind,
      authority: record.authority,
      trust: record.trust,
      url: record.url,
      status: record.status,
      supports: [...record.supports].sort(compareText),
      discoveredFrom: provenance[0].discoveredFromSourceId,
      trustEvidenceSourceIds: evidence,
      snapshot: null,
      conflictsWith: []
    };
    sources.set(source.id, source);
    packages.get(record.packageId).add(source.id);
  }

  const byPackageAndRole = new Map();
  for (const record of generated.values()) {
    for (const role of record.supports) {
      const key = `${record.packageId}\u0000${role}`;
      if (!byPackageAndRole.has(key)) byPackageAndRole.set(key, []);
      byPackageAndRole.get(key).push(record.id);
    }
  }
  for (const ids of byPackageAndRole.values()) {
    const uniqueIds = sortedUnique(ids);
    if (uniqueIds.length < 2) continue;
    for (const id of uniqueIds) {
      const record = generated.get(id);
      for (const otherId of uniqueIds) if (otherId !== id) record.conflictsWith.add(otherId);
    }
  }

  const warnings = [];
  for (const record of generated.values()) {
    const source = sources.get(record.id);
    source.conflictsWith = [...record.conflictsWith].sort(compareText);
    if (source.conflictsWith.length > 0) {
      const role = source.supports[0];
      warnings.push({
        code: 'SOURCE_CONFLICT',
        packageId: record.packageId,
        sourceId: source.id,
        message: conflictMessage(record.packageId, role),
        retryable: false
      });
    }
  }

  const graph = {
    packages: [...packages.entries()].map(([packageId, sourceIds]) => ({
      packageId,
      sourceIds: [...sourceIds].sort(compareText)
    })).sort((left, right) => compareText(left.packageId, right.packageId)),
    sources: [...sources.values()].sort((left, right) => compareText(left.id, right.id)),
    warnings: warnings.sort(comparableWarning)
  };
  validateSourceGraph(graph);
  return graph;
}

function fail(errors) {
  if (errors.length > 0) {
    throw new Error(`Source provenance invariant violation: ${errors.sort(compareText).join(' ')}`);
  }
}

/** Validate canonical ordering and relational rules for the internal graph. */
export function validateSourceGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    throw new Error('Source provenance invariant violation: graph must be an object.');
  }
  const packages = Array.isArray(graph.packages) ? graph.packages : null;
  const sources = Array.isArray(graph.sources) ? graph.sources : null;
  const warnings = Array.isArray(graph.warnings) ? graph.warnings : null;
  if (!packages || !sources || !warnings) {
    throw new Error('Source provenance invariant violation: graph requires packages, sources, and warnings arrays.');
  }
  if (!isSorted(packages, (left, right) => compareText(left.packageId, right.packageId))) errors.push('packages must be sorted by packageId.');
  if (!isSorted(sources, (left, right) => compareText(left.id, right.id))) errors.push('sources must be sorted by id.');
  if (!isSorted(warnings, comparableWarning)) errors.push('warnings must be sorted canonically.');

  const sourceIds = new Set();
  for (const source of sources) {
    if (!source || typeof source.id !== 'string' || /\s/.test(source.id) || sourceIds.has(source.id)) {
      errors.push('source IDs must be unique non-whitespace strings.');
      continue;
    }
    sourceIds.add(source.id);
  }
  const packageIds = new Set();
  for (const packageRecord of packages) {
    if (!packageRecord || typeof packageRecord.packageId !== 'string' || packageIds.has(packageRecord.packageId)) {
      errors.push('package IDs must be unique strings.');
      continue;
    }
    packageIds.add(packageRecord.packageId);
    if (!Array.isArray(packageRecord.sourceIds)
      || !isSorted(packageRecord.sourceIds, compareText)
      || new Set(packageRecord.sourceIds).size !== packageRecord.sourceIds.length) {
      errors.push(`package ${packageRecord.packageId} sourceIds must be sorted and unique.`);
    }
    for (const sourceId of packageRecord.sourceIds ?? []) {
      if (!sourceIds.has(sourceId)) errors.push(`package ${packageRecord.packageId} references unknown source ${sourceId}.`);
    }
  }

  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  for (const source of sources) {
    if (!SOURCE_KINDS.has(source.kind) || !AUTHORITIES.has(source.authority)
      || !TRUSTS.has(source.trust) || !STATUSES.has(source.status)) {
      errors.push(`source ${source.id} has an unsupported classification.`);
    }
    const portableUrl = source.kind === 'registry'
      ? canonicalizeSourceUrl(source.url) !== null
      : isCanonicalPublicSourceUrl(source.url);
    if (!portableUrl) errors.push(`source ${source.id} has a non-portable URL.`);
    if (!Array.isArray(source.supports) || source.supports.length === 0
      || !isSorted(source.supports, compareText)
      || new Set(source.supports).size !== source.supports.length) {
      errors.push(`source ${source.id} supports must be sorted, unique, and non-empty.`);
    }
    if (!Array.isArray(source.trustEvidenceSourceIds)
      || !isSorted(source.trustEvidenceSourceIds, compareText)
      || new Set(source.trustEvidenceSourceIds).size !== source.trustEvidenceSourceIds.length) {
      errors.push(`source ${source.id} trust evidence must be sorted and unique.`);
    }
    for (const evidenceId of source.trustEvidenceSourceIds ?? []) {
      if (!sourceIds.has(evidenceId)) errors.push(`source ${source.id} references unknown trust evidence ${evidenceId}.`);
    }
    if (source.discoveredFrom !== null && !sourceIds.has(source.discoveredFrom)) {
      errors.push(`source ${source.id} references unknown provenance source.`);
    }
    if (source.kind === 'registry') {
      if (source.discoveredFrom !== null || !source.id.includes(':registry')) {
        errors.push(`registry source ${source.id} must preserve adapter-owned provenance.`);
      }
    } else {
      if (!source.id.endsWith(`:${digest(source.url)}`)) errors.push(`source ${source.id} does not match its canonical URL digest.`);
      if (source.authority === 'officialProject' || source.trust === 'official') {
        errors.push(`source ${source.id} cannot claim official project control without an explicit rule.`);
      }
      if (source.status === 'unverified' && source.snapshot !== null) {
        errors.push(`unfetched source ${source.id} must not have a snapshot.`);
      }
      if (['available', 'stale'].includes(source.status) && source.snapshot === null) {
        errors.push(`fetched source ${source.id} must have a snapshot.`);
      }
      if (['notFound', 'unavailable'].includes(source.status) && source.snapshot !== null) {
        errors.push(`unavailable source ${source.id} must not have a snapshot.`);
      }
    }
    if (source.trust === 'verified') {
      const independent = source.trustEvidenceSourceIds
        .filter((id) => sourcesById.get(id)?.kind === 'registry');
      if (independent.length < 2) errors.push(`verified source ${source.id} lacks independent registry evidence.`);
    }
    if (source.conflictsWith !== undefined) {
      if (!Array.isArray(source.conflictsWith) || !isSorted(source.conflictsWith, compareText)
        || new Set(source.conflictsWith).size !== source.conflictsWith.length) {
        errors.push(`source ${source.id} conflicts must be sorted and unique.`);
      }
      for (const conflictId of source.conflictsWith ?? []) {
        const conflict = sourcesById.get(conflictId);
        if (!conflict || conflictId === source.id || !conflict.conflictsWith?.includes(source.id)) {
          errors.push(`source ${source.id} has an invalid conflict reference.`);
        }
      }
    }
  }

  for (const warning of warnings) {
    if (warning?.code !== 'SOURCE_CONFLICT' || !packageIds.has(warning.packageId)
      || !sourceIds.has(warning.sourceId) || warning.retryable !== false) {
      errors.push('warning must be a resolved non-retryable SOURCE_CONFLICT.');
    }
  }
  fail(errors);
  return graph;
}
