import { createHash } from 'node:crypto';

import { canonicalJsonBytes } from '../canonical-json.js';
import {
  JAVASCRIPT_USAGE_ANALYZER_ID,
  JAVASCRIPT_USAGE_ANALYZER_VERSION
} from '../usage/js/analyzer.js';
import { compareText } from '../portable.js';
import { migrationChecklistEligibility } from './grounding-policy.js';
import { loadMigrationChecklistInputs } from './input-loader.js';

export const MIGRATION_TASK_CONTEXT_VERSION = '1';
export const DEFAULT_MIGRATION_CONTEXT_MAX_EVIDENCE_ITEMS = 6;
export const DEFAULT_MIGRATION_CONTEXT_MAX_EVIDENCE_CHARACTERS = 24_000;
export const DEFAULT_MIGRATION_CONTEXT_MAX_FINDING_SUMMARY_CHARACTERS = 2_000;

export const MIGRATION_LOCATION_REASON_CODES = Object.freeze([
  'POSITIVE_USAGE_MATCH',
  'NO_POSITIVE_USAGE_MATCH',
  'UNSUPPORTED_USAGE_COVERAGE',
  'NOT_ANALYZED'
]);

const ACTION_EVIDENCE_KINDS = new Set([
  'migrationGuide',
  'breakingChanges',
  'deprecations',
  'releaseNotes',
  'changelog'
]);

const EVIDENCE_KIND_PRIORITY = Object.freeze({
  migrationGuide: 0,
  breakingChanges: 1,
  deprecations: 2,
  releaseNotes: 3,
  changelog: 4
});

const compareLimitations = (left, right) => (
  compareText(left.code, right.code) || compareText(left.message, right.message)
);
const compareLocations = (left, right) => (
  compareText(left.impactEvidenceId, right.impactEvidenceId)
  || compareText(left.symbol, right.symbol)
  || compareText(left.file, right.file)
);
const compareContexts = (left, right) => (
  compareText(left.dependency.projectId, right.dependency.projectId)
  || compareText(left.dependency.manifest, right.dependency.manifest)
  || compareText(left.dependency.dependencyType, right.dependency.dependencyType)
  || compareText(left.dependency.packageId, right.dependency.packageId)
  || compareText(left.finding.id, right.finding.id)
  || compareText(left.contextId, right.contextId)
);
const compareFallbackRecords = (left, right) => (
  compareText(left.dependency.projectId, right.dependency.projectId)
  || compareText(left.dependency.manifest, right.dependency.manifest)
  || compareText(left.dependency.dependencyType, right.dependency.dependencyType)
  || compareText(left.dependency.packageId, right.dependency.packageId)
  || compareText(left.analysisResultId, right.analysisResultId)
);

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sortedUniqueText(values = []) {
  return [...new Set(values)].sort(compareText);
}

function sortedUniqueLimitations(values = []) {
  const unique = new Map();
  for (const value of values) unique.set(`${value.code}\0${value.message}`, structuredClone(value));
  return [...unique.values()].sort(compareLimitations);
}

function limitation(code, message) {
  return { code, message };
}

function humanReviewLimitation(result) {
  if (!result.requiresHumanReview && result.humanReviewReasons.length === 0) return [];
  const reasons = sortedUniqueText(result.humanReviewReasons);
  return [limitation(
    'UPSTREAM_HUMAN_REVIEW_REQUIRED',
    reasons.length > 0
      ? `Version Analysis requires human review: ${reasons.join(', ')}.`
      : 'Version Analysis requires human review.'
  )];
}

function validateBounds(options) {
  const bounds = {
    maxEvidenceItems: options.maxEvidenceItems ?? DEFAULT_MIGRATION_CONTEXT_MAX_EVIDENCE_ITEMS,
    maxEvidenceCharacters: options.maxEvidenceCharacters
      ?? DEFAULT_MIGRATION_CONTEXT_MAX_EVIDENCE_CHARACTERS,
    maxFindingSummaryCharacters: options.maxFindingSummaryCharacters
      ?? DEFAULT_MIGRATION_CONTEXT_MAX_FINDING_SUMMARY_CHARACTERS
  };
  for (const [field, value] of Object.entries(bounds)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`Migration Context input error: ${field} must be a positive safe integer.`);
    }
  }
  return bounds;
}

function isOfficialActionSource(source) {
  return ['official', 'publisher'].includes(source.trust)
    && ['officialProject', 'publisherProvided'].includes(source.authority)
    && source.kind !== 'registry'
    && source.kind !== 'community';
}

function sourceIsStale(source) {
  return source.status === 'stale' || source.snapshot?.freshness === 'stale';
}

function sourceHasConflict(source, packageId, knowledgeManifest, result) {
  if ((source.conflictsWith?.length ?? 0) > 0) return true;
  if (result.validation.warningCodes.includes('SOURCE_CONFLICT')) return true;
  if (result.limitations.some((item) => item.code === 'SOURCE_CONFLICT')) return true;
  return knowledgeManifest.warnings.some((warning) => (
    warning.code === 'SOURCE_CONFLICT'
    && (!warning.packageId || warning.packageId === packageId)
    && (!warning.sourceId || warning.sourceId === source.id)
  ));
}

function sourceHasStaleWarning(source, packageId, knowledgeManifest, result) {
  if (sourceIsStale(source)) return true;
  if (result.validation.warningCodes.includes('CACHE_EXPIRED')) return true;
  if (result.limitations.some((item) => item.code === 'CACHE_EXPIRED')) return true;
  return knowledgeManifest.warnings.some((warning) => (
    warning.code === 'CACHE_EXPIRED'
    && (!warning.packageId || warning.packageId === packageId)
    && (!warning.sourceId || warning.sourceId === source.id)
  ));
}

function evidenceRecord(bundleItem, source) {
  return {
    id: bundleItem.id,
    sourceId: bundleItem.sourceId,
    sourceUrl: source.url,
    kind: bundleItem.kind,
    authority: source.authority,
    trust: source.trust,
    retrievedAt: bundleItem.retrievedAt,
    contentDigest: bundleItem.contentDigest,
    locator: bundleItem.locator,
    releaseVersions: [...bundleItem.releaseVersions],
    content: bundleItem.content
  };
}

function compareEvidence(left, right) {
  return (EVIDENCE_KIND_PRIORITY[left.record.kind] ?? 99)
    - (EVIDENCE_KIND_PRIORITY[right.record.kind] ?? 99)
    || compareText(left.record.id, right.record.id);
}

function evidenceScopeMatches(bundleItem, targetVersion) {
  return targetVersion !== null && bundleItem.releaseVersions.includes(targetVersion);
}

function resolveFindingEvidence(artifacts, result, finding, bounds) {
  const bundledById = new Map(artifacts.knowledgeEvidenceBundle.evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(artifacts.knowledgeManifest.sources.map((item) => [item.id, item]));
  const resolved = finding.evidenceRefs.map((ref) => {
    const bundleItem = bundledById.get(ref);
    const source = sourcesById.get(bundleItem.sourceId);
    return { bundleItem, source, record: evidenceRecord(bundleItem, source) };
  });
  const invalid = resolved.filter(({ source }) => (
    sourceHasConflict(source, result.dependency.packageId, artifacts.knowledgeManifest, result)
    || sourceHasStaleWarning(source, result.dependency.packageId, artifacts.knowledgeManifest, result)
  ));
  const usefulOfficialRefs = resolved
    .filter(({ source }) => isOfficialActionSource(source))
    .map(({ record }) => record.id)
    .sort(compareText);
  const candidates = resolved
    .filter(({ bundleItem, source }) => (
      isOfficialActionSource(source)
      && source.status === 'available'
      && !sourceIsStale(source)
      && ACTION_EVIDENCE_KINDS.has(bundleItem.kind)
      && evidenceScopeMatches(bundleItem, result.versions.targetVersion)
    ))
    .sort(compareEvidence);

  const selected = [];
  const contentDigests = new Set();
  let characters = 0;
  let boundsApplied = false;
  for (const candidate of candidates) {
    if (contentDigests.has(candidate.record.contentDigest)) continue;
    if (selected.length >= bounds.maxEvidenceItems
        || characters + candidate.record.content.length > bounds.maxEvidenceCharacters) {
      boundsApplied = true;
      continue;
    }
    selected.push(candidate.record);
    contentDigests.add(candidate.record.contentDigest);
    characters += candidate.record.content.length;
  }
  return {
    selected,
    usefulOfficialRefs,
    hasInvalidEvidence: invalid.length > 0,
    invalidReasons: sortedUniqueText(invalid.flatMap(({ source }) => [
      ...(sourceHasConflict(source, result.dependency.packageId, artifacts.knowledgeManifest, result)
        ? ['SOURCE_CONFLICT'] : []),
      ...(sourceHasStaleWarning(source, result.dependency.packageId, artifacts.knowledgeManifest, result)
        ? ['STALE_EVIDENCE'] : [])
    ])),
    boundsApplied
  };
}

/** Classify action-generation eligibility without considering repository location coverage. */
export function classifyMigrationEligibility({
  analysisStatus,
  targetVersion,
  selectedEvidence = [],
  hasInvalidEvidence = false,
  summaryWithinBounds = true
}) {
  if (analysisStatus !== 'analyzed') return migrationChecklistEligibility('NOT_ANALYZED');
  if (hasInvalidEvidence) return migrationChecklistEligibility('INVALID_OR_CONFLICTED_EVIDENCE');
  if (targetVersion === null || selectedEvidence.length === 0 || !summaryWithinBounds) {
    return migrationChecklistEligibility('NO_GROUNDED_ACTION');
  }
  return migrationChecklistEligibility('ELIGIBLE');
}

function positiveLocations(impactEvidenceFinding) {
  if (!impactEvidenceFinding?.impacted) return [];
  return impactEvidenceFinding.matchedSymbols.flatMap((match) => (
    match.usages.map((usage) => ({
      impactEvidenceId: impactEvidenceFinding.id,
      symbol: match.symbol,
      file: usage.file
    }))
  )).sort(compareLocations);
}

function projectUsageCoverageSupported(artifacts, result) {
  const project = artifacts.projectManifest.projects.find((item) => item.id === result.dependency.projectId);
  return project?.ecosystem === 'node'
    && artifacts.projectManifest.projects.length === 1
    && artifacts.usageIndex.analysis.analyzers.some((analyzer) => (
      analyzer.id === JAVASCRIPT_USAGE_ANALYZER_ID
      && analyzer.version === JAVASCRIPT_USAGE_ANALYZER_VERSION
    ))
    && artifacts.usageIndex.analysis.scannedFileCount === artifacts.usageIndex.analysis.analyzedFileCount
    && artifacts.usageIndex.warnings.length === 0;
}

function locationEligibility(artifacts, result, locations) {
  if (result.status !== 'analyzed') {
    return { status: 'INELIGIBLE', reasonCode: 'NOT_ANALYZED' };
  }
  if (locations.length > 0) {
    return { status: 'ELIGIBLE', reasonCode: 'POSITIVE_USAGE_MATCH' };
  }
  if (projectUsageCoverageSupported(artifacts, result)) {
    return { status: 'REVIEW_REQUIRED', reasonCode: 'NO_POSITIVE_USAGE_MATCH' };
  }
  return { status: 'REVIEW_REQUIRED', reasonCode: 'UNSUPPORTED_USAGE_COVERAGE' };
}

function locationLimitations(eligibility) {
  if (eligibility.reasonCode === 'UNSUPPORTED_USAGE_COVERAGE') {
    return [limitation(
      'UNSUPPORTED_USAGE_COVERAGE',
      'Usage coverage cannot be proven for this project; no repository location or unused/safe conclusion is available.'
    )];
  }
  if (eligibility.reasonCode === 'NO_POSITIVE_USAGE_MATCH') {
    return [limitation(
      'NO_POSITIVE_USAGE_MATCH',
      'No positive exact usage match was recorded; this is not evidence that the dependency is unused or safe to upgrade.'
    )];
  }
  return [];
}

function classificationLimitations(result, evidence, eligibility, summaryWithinBounds) {
  const values = [
    ...result.limitations,
    ...humanReviewLimitation(result)
  ];
  if (eligibility.reasonCode === 'INVALID_OR_CONFLICTED_EVIDENCE') {
    values.push(limitation(
      'INVALID_OR_CONFLICTED_EVIDENCE',
      `Selected evidence cannot ground an action: ${evidence.invalidReasons.join(', ') || 'invalid evidence state'}.`
    ));
  } else if (eligibility.reasonCode === 'NO_GROUNDED_ACTION') {
    values.push(limitation(
      'NO_GROUNDED_ACTION',
      'No bounded, target-scoped official or publisher evidence is available for action generation.'
    ));
  }
  if (!summaryWithinBounds) {
    values.push(limitation(
      'FINDING_SUMMARY_EXCEEDS_BOUND',
      'The finding summary exceeds the deterministic model-context bound and was not sent for generation.'
    ));
  }
  if (evidence.boundsApplied) {
    values.push(limitation(
      'EVIDENCE_BOUNDS_APPLIED',
      'Additional eligible evidence was excluded by deterministic item or character bounds.'
    ));
  }
  if (result.versions.targetPolicy === 'registryLatest') {
    values.push(limitation(
      'REGISTRY_LATEST_IS_NOT_RECOMMENDATION',
      'The target is a registry-latest fact and is not a recommended migration target.'
    ));
  }
  return values;
}

function contextId(input, payload) {
  return digest({
    contextVersion: MIGRATION_TASK_CONTEXT_VERSION,
    inputDigests: Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value.artifactDigest])),
    payload
  });
}

function buildEligibleContext({ artifacts, result, finding, evidence, locations, locationState, limitations }) {
  const selectedRefs = evidence.selected.map((item) => item.id).sort(compareText);
  const payload = {
    dependency: structuredClone(result.dependency),
    versions: structuredClone(result.versions),
    analysisResultId: result.id,
    finding: {
      id: finding.id,
      kind: finding.kind,
      summary: finding.summary,
      appliesToVersions: [...finding.appliesToVersions],
      evidenceRefs: selectedRefs
    },
    evidence: structuredClone(evidence.selected),
    evidenceAllowlist: selectedRefs,
    positiveCandidateLocations: structuredClone(locations),
    eligibility: migrationChecklistEligibility('ELIGIBLE'),
    locationEligibility: locationState,
    requiresHumanReview: true,
    humanReviewReasons: sortedUniqueText([
      ...result.humanReviewReasons,
      'MIGRATION_CHECKLIST_DRAFT_REVIEW_REQUIRED'
    ]),
    limitations: sortedUniqueLimitations(limitations)
  };
  return {
    contextVersion: MIGRATION_TASK_CONTEXT_VERSION,
    contextId: contextId(artifacts.input, payload),
    ...payload
  };
}

function fallbackInstruction(reasonCode) {
  if (reasonCode === 'INVALID_OR_CONFLICTED_EVIDENCE') {
    return 'Manual review is required because selected official evidence is stale or conflicted.';
  }
  return 'Manual review is required because no bounded official migration action is available.';
}

function fallbackFinding(finding, eligibility, evidenceRefs) {
  return {
    id: finding.id,
    kind: finding.kind,
    summary: finding.summary,
    eligibilityReasonCode: eligibility.reasonCode,
    evidenceRefs: sortedUniqueText(evidenceRefs),
    positiveImpactLocations: [],
    items: [{
      kind: 'MANUAL_REVIEW_REQUIRED',
      basis: 'DETERMINISTIC',
      instruction: fallbackInstruction(eligibility.reasonCode),
      findingId: finding.id,
      evidenceRefs: sortedUniqueText(evidenceRefs),
      candidateLocations: [],
      requiresHumanReview: true
    }]
  };
}

function baseFallbackRecord(result) {
  return {
    analysisResultId: result.id,
    dependency: structuredClone(result.dependency),
    versions: structuredClone(result.versions),
    analysisStatus: result.status,
    selectedEvidenceRefs: [],
    findings: [],
    limitations: []
  };
}

function notAnalyzedFallback(result) {
  const record = baseFallbackRecord(result);
  record.limitations = sortedUniqueLimitations([
    ...result.limitations,
    ...humanReviewLimitation(result),
    limitation(
      'NOT_ANALYZED',
      `Version Analysis status is ${result.status}; next action is ${result.nextAction}.`
    )
  ]);
  return record;
}

function noFindingFallback(result) {
  const record = baseFallbackRecord(result);
  record.limitations = sortedUniqueLimitations([
    ...result.limitations,
    ...humanReviewLimitation(result),
    limitation('NO_GROUNDED_ACTION', 'Version Analysis contains no breaking-change finding to ground a migration action.')
  ]);
  return record;
}

function impactEvidenceByResult(artifacts) {
  return new Map(artifacts.repositoryImpactEvidence.dependencies.map((dependency) => [
    dependency.analysisResultId,
    new Map(dependency.findings.map((finding) => [finding.findingId, finding]))
  ]));
}

/** Build immutable, minimal MP-03 contexts and MP-01-compatible deterministic fallbacks. */
export function buildMigrationTaskContexts(artifacts, options = {}) {
  const bounds = validateBounds(options);
  const evidenceByResult = impactEvidenceByResult(artifacts);
  const eligibleContexts = [];
  const fallbackRecords = [];
  const summary = {
    totalFindings: 0,
    eligible: 0,
    notAnalyzed: 0,
    noGroundedAction: 0,
    unsupportedUsageCoverage: 0,
    conflictedEvidence: 0
  };

  for (const result of artifacts.versionAnalysis.results) {
    if (result.status !== 'analyzed') {
      fallbackRecords.push(notAnalyzedFallback(result));
      summary.notAnalyzed += 1;
      continue;
    }
    const breakingFindings = result.findings.filter((finding) => finding.kind === 'breakingChange');
    if (breakingFindings.length === 0) {
      fallbackRecords.push(noFindingFallback(result));
      summary.noGroundedAction += 1;
      continue;
    }
    const fallback = baseFallbackRecord(result);
    for (const finding of breakingFindings) {
      summary.totalFindings += 1;
      const resolvedEvidence = resolveFindingEvidence(artifacts, result, finding, bounds);
      const summaryWithinBounds = finding.summary.length <= bounds.maxFindingSummaryCharacters;
      const eligibility = classifyMigrationEligibility({
        analysisStatus: result.status,
        targetVersion: result.versions.targetVersion,
        selectedEvidence: resolvedEvidence.selected,
        hasInvalidEvidence: resolvedEvidence.hasInvalidEvidence,
        summaryWithinBounds
      });
      const impactFinding = evidenceByResult.get(result.id)?.get(finding.id);
      const locations = positiveLocations(impactFinding);
      const locationState = locationEligibility(artifacts, result, locations);
      const limitations = sortedUniqueLimitations([
        ...classificationLimitations(result, resolvedEvidence, eligibility, summaryWithinBounds),
        ...locationLimitations(locationState)
      ]);
      if (locationState.reasonCode === 'UNSUPPORTED_USAGE_COVERAGE') {
        summary.unsupportedUsageCoverage += 1;
      }
      if (eligibility.reasonCode === 'ELIGIBLE') {
        eligibleContexts.push(buildEligibleContext({
          artifacts,
          result,
          finding,
          evidence: resolvedEvidence,
          locations,
          locationState,
          limitations
        }));
        summary.eligible += 1;
        continue;
      }
      if (eligibility.reasonCode === 'INVALID_OR_CONFLICTED_EVIDENCE') {
        summary.conflictedEvidence += 1;
      } else {
        summary.noGroundedAction += 1;
      }
      const refs = resolvedEvidence.usefulOfficialRefs;
      fallback.findings.push(fallbackFinding(finding, eligibility, refs));
      fallback.selectedEvidenceRefs.push(...refs);
      fallback.limitations.push(...limitations);
    }
    if (fallback.findings.length > 0) {
      fallback.findings.sort((left, right) => compareText(left.id, right.id));
      fallback.selectedEvidenceRefs = sortedUniqueText(fallback.selectedEvidenceRefs);
      fallback.limitations = sortedUniqueLimitations(fallback.limitations);
      fallbackRecords.push(fallback);
    }
  }

  const output = {
    contextVersion: MIGRATION_TASK_CONTEXT_VERSION,
    input: structuredClone(artifacts.input),
    eligibleContexts: eligibleContexts.sort(compareContexts),
    fallbackRecords: fallbackRecords.sort(compareFallbackRecords),
    summary
  };
  return deepFreeze(structuredClone(output));
}

/** Public MP-02 orchestration: load seven artifacts, then prepare contexts without AI or I/O writes. */
export async function prepareMigrationChecklistContexts(input, options = {}) {
  const artifacts = await loadMigrationChecklistInputs(input, options);
  return buildMigrationTaskContexts(artifacts, options);
}
