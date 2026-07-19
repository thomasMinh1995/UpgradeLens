import { createHash } from 'node:crypto';

import { canonicalJsonBytes } from '../canonical-json.js';
import { compareText } from '../portable.js';
import { coverageForProject } from '../usage/coverage.js';
import { loadPersistedUpgradeDecision } from '../upgrade-decision/input-loader.js';
import { migrationChecklistEligibility } from './grounding-policy.js';
import { loadMigrationChecklistInputs } from './input-loader.js';
import {
  extractProjectVerification,
  unavailableProjectVerification
} from './verification.js';

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
const compareAffectedAreas = (left, right) => (
  compareText(left.impactEvidenceId, right.impactEvidenceId)
  || compareText(left.findingId, right.findingId)
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

function recommendationDriver(decision) {
  if (decision.reasonCodes.includes('USER_SELECTED_TARGET')) return 'USER_SELECTED_TARGET';
  if (decision.reasonCodes.includes('STRUCTURED_URGENCY')) return 'STRUCTURED_URGENCY';
  return null;
}

function decisionProjection(decision) {
  return {
    status: decision.decision,
    targetOrigin: decision.versions.targetPolicy ?? 'unknown',
    recommendationDriver: recommendationDriver(decision),
    primaryReasonCode: decision.primaryReasonCode,
    reasonCodes: [...decision.reasonCodes]
  };
}

function officialEvidenceFor(artifacts, refs) {
  const bundle = new Map(artifacts.knowledgeEvidenceBundle.evidence.map((item) => [item.id, item]));
  const sources = new Map(artifacts.knowledgeManifest.sources.map((item) => [item.id, item]));
  return refs.flatMap((ref) => {
    const evidence = bundle.get(ref);
    const source = evidence ? sources.get(evidence.sourceId) : null;
    if (!evidence || !source) return [];
    return [{
      id: evidence.id,
      sourceId: evidence.sourceId,
      kind: evidence.kind,
      authority: source.authority,
      trust: source.trust,
      contentDigest: evidence.contentDigest,
      locator: evidence.locator,
      releaseVersions: [...evidence.releaseVersions]
    }];
  }).sort((left, right) => compareText(left.id, right.id));
}

function preconditionsFor(decision) {
  if (!['PLAN_UPGRADE', 'UPGRADE_NOW'].includes(decision.decision)) return [];
  return [
    {
      code: 'EXPLICIT_TARGET_SELECTED',
      message: 'The target was selected through the structured explicit-target boundary.'
    },
    {
      code: 'TARGET_SCOPED_EVIDENCE_VALID',
      message: 'Target-scoped official or publisher evidence passed Upgrade Decision validation.'
    },
    {
      code: 'HUMAN_APPROVAL_REQUIRED',
      message: 'A human reviewer must approve migration scope before source changes.'
    }
  ];
}

function reviewQuestionsFor(decision) {
  if (decision.decision !== 'INVESTIGATE') return [];
  const questionByReason = {
    EVIDENCE_CONFLICT: 'Which conflicting evidence should govern the selected dependency occurrence?',
    NON_REGISTRY_DEPENDENCY: 'How is this non-registry dependency resolved and versioned in the project?',
    UNSUPPORTED_ECOSYSTEM: 'Which supported analyzer and version comparator can validate this ecosystem?',
    UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER:
      'Has a human or structured policy selected this target for migration?',
    USAGE_COVERAGE_PARTIAL: 'Which repository areas were not covered by usage analysis?',
    USAGE_COVERAGE_UNAVAILABLE: 'How will dependency usage be inspected without supported analyzer coverage?',
    VERSION_INCOMPARABLE: 'Which ecosystem-aware comparison can establish installed-to-target direction?'
  };
  return [questionByReason[decision.primaryReasonCode]
    ?? 'Which missing or uncertain fact must be resolved before migration planning?'];
}

function missingInformationFor(decision) {
  if (decision.decision !== 'INSUFFICIENT_EVIDENCE') return [];
  const messageByReason = {
    EVIDENCE_INSUFFICIENT: 'Valid target-scoped official migration evidence is unavailable.',
    INSTALLED_VERSION_UNAVAILABLE: 'The installed version baseline is unavailable.',
    TARGET_VERSION_UNAVAILABLE: 'A validated target version is unavailable.'
  };
  return [{
    code: decision.primaryReasonCode,
    message: messageByReason[decision.primaryReasonCode]
      ?? 'Required deterministic upgrade evidence is unavailable.'
  }];
}

function nextStepFor(decision) {
  const values = {
    EVIDENCE_INSUFFICIENT: {
      code: 'COLLECT_TARGET_EVIDENCE',
      message: 'Collect valid target-scoped official or publisher evidence and rerun Upgrade Decision.'
    },
    INSTALLED_VERSION_UNAVAILABLE: {
      code: 'RESOLVE_INSTALLED_BASELINE',
      message: 'Resolve the installed dependency version and rerun the upstream analysis.'
    },
    TARGET_VERSION_UNAVAILABLE: {
      code: 'SELECT_OR_DISCOVER_TARGET',
      message: 'Provide or discover a validated target version and rerun the upstream analysis.'
    },
    VERSION_ANALYSIS_FAILED: {
      code: 'RERUN_VERSION_ANALYSIS',
      message: 'Resolve the recorded failure and rerun Version Analysis.'
    },
    VERSION_ANALYSIS_MISSING: {
      code: 'RERUN_VERSION_ANALYSIS',
      message: 'Run Version Analysis for this dependency occurrence.'
    },
    VERSION_ANALYSIS_SKIPPED: {
      code: 'RERUN_VERSION_ANALYSIS',
      message: 'Resolve the recorded skip condition and rerun Version Analysis.'
    }
  };
  if (values[decision.primaryReasonCode]) return values[decision.primaryReasonCode];
  if (decision.decision === 'INVESTIGATE') {
    return {
      code: 'COMPLETE_HUMAN_INVESTIGATION',
      message: 'Resolve the deterministic investigation questions before selecting migration work.'
    };
  }
  if (['PLAN_UPGRADE', 'UPGRADE_NOW'].includes(decision.decision)) {
    return {
      code: 'REVIEW_MIGRATION_HANDOFF',
      message: 'Review evidence-bounded actions, affected areas, and verification state.'
    };
  }
  return { code: 'NONE', message: 'No migration handoff step is required.' };
}

function handoffBasis(decision, affectedAreas, verification, officialEvidence) {
  return {
    decisionId: decision.id,
    decision: decisionProjection(decision),
    affectedAreas: structuredClone(affectedAreas).sort(compareAffectedAreas),
    coverage: structuredClone(decision.impact.coverage),
    verification: structuredClone(verification),
    officialEvidence: structuredClone(officialEvidence),
    preconditions: preconditionsFor(decision),
    recovery: { status: 'RECOVERY_PLAN_NOT_PROVIDED', evidenceRefs: [] },
    reviewQuestions: reviewQuestionsFor(decision),
    missingInformation: missingInformationFor(decision),
    nextStep: nextStepFor(decision),
    humanReviewRequired: decision.requiresHumanReview
  };
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

function affectedAreasFor(artifacts, decision) {
  if (decision.analysisResultId === null) return [];
  const dependency = artifacts.repositoryImpactEvidence.dependencies
    .find((item) => item.analysisResultId === decision.analysisResultId);
  if (!dependency) return [];
  return dependency.findings.flatMap((finding) => (
    positiveLocations(finding).map((location) => ({
      ...location,
      findingId: finding.findingId,
      coverageStatus: dependency.coverage?.status ?? 'unavailable'
    }))
  )).sort(compareAffectedAreas);
}

function projectUsageCoverageSupported(artifacts, result) {
  return coverageForProject(
    artifacts.usageIndex,
    result.dependency.projectId,
    result.dependency.ecosystem
  ).status === 'complete';
}

function locationEligibility(artifacts, result, locations, impactEvidenceFinding) {
  if (result.status !== 'analyzed') {
    return { status: 'INELIGIBLE', reasonCode: 'NOT_ANALYZED' };
  }
  if (locations.length > 0) {
    return { status: 'ELIGIBLE', reasonCode: 'POSITIVE_USAGE_MATCH' };
  }
  if (impactEvidenceFinding?.status === 'COVERAGE_UNAVAILABLE') {
    return { status: 'REVIEW_REQUIRED', reasonCode: 'UNSUPPORTED_USAGE_COVERAGE' };
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

function buildEligibleContext({
  artifacts,
  result,
  decision,
  handoff,
  finding,
  evidence,
  locations,
  locationState,
  limitations
}) {
  const selectedRefs = evidence.selected.map((item) => item.id).sort(compareText);
  const payload = {
    dependency: structuredClone(result.dependency),
    versions: structuredClone(result.versions),
    analysisResultId: result.id,
    ...structuredClone(handoff),
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

function baseFallbackRecord(result, handoff) {
  return {
    analysisResultId: result.id,
    ...structuredClone(handoff),
    dependency: structuredClone(result.dependency),
    versions: structuredClone(result.versions),
    analysisStatus: result.status,
    selectedEvidenceRefs: [],
    findings: [],
    limitations: []
  };
}

function notAnalyzedFallback(result, handoff) {
  const record = baseFallbackRecord(result, handoff);
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

function noFindingFallback(result, handoff) {
  const record = baseFallbackRecord(result, handoff);
  record.limitations = sortedUniqueLimitations([
    ...result.limitations,
    ...humanReviewLimitation(result),
    limitation('NO_GROUNDED_ACTION', 'Version Analysis contains no breaking-change finding to ground a migration action.')
  ]);
  return record;
}

function upgradeDecisionFallback(result, decision, handoff) {
  const record = baseFallbackRecord(result, handoff);
  record.selectedEvidenceRefs = [...decision.evidence.targetScopedRefs];
  const manualReview = ['INVESTIGATE', 'INSUFFICIENT_EVIDENCE', 'NOT_ANALYZED']
    .includes(decision.decision);
  record.limitations = sortedUniqueLimitations([
    ...result.limitations,
    ...decision.limitations,
    ...humanReviewLimitation(result),
    ...(decision.decision === 'NOT_ANALYZED' ? [limitation(
      'NOT_ANALYZED',
      `Version Analysis status is ${result.status}; next action is ${result.nextAction}.`
    )] : []),
    limitation(
      `UPGRADE_DECISION_${decision.decision}`,
      manualReview
        ? `Deterministic Upgrade Decision is ${decision.decision}; migration action generation is blocked pending human review or additional evidence.`
        : 'Deterministic Upgrade Decision is KEEP_CURRENT; no version-change action is permitted.'
    )
  ]);
  return record;
}

function missingAnalysisFallback(decision, handoff) {
  return {
    analysisResultId: null,
    ...structuredClone(handoff),
    dependency: structuredClone(decision.occurrence),
    versions: {
      analysisMode: 'unsupportedBaseline',
      declaredVersion: decision.versions.declaredVersion,
      installedVersion: null,
      installedVersionStatus: 'legacyMissing',
      installedVersionSource: null,
      installedVersionReason: null,
      currentVersion: null,
      currentVersionSource: null,
      targetVersion: decision.versions.targetVersion,
      targetPolicy: decision.versions.targetPolicy,
      delta: { direction: 'unknown', classification: 'unknown' }
    },
    analysisStatus: 'missing',
    selectedEvidenceRefs: [...decision.evidence.targetScopedRefs],
    findings: [],
    limitations: sortedUniqueLimitations([
      ...decision.limitations,
      limitation(
        'VERSION_ANALYSIS_MISSING',
        'No Version Analysis result exists for this dependency occurrence.'
      )
    ])
  };
}

function impactEvidenceByResult(artifacts) {
  return new Map(artifacts.repositoryImpactEvidence.dependencies.map((dependency) => [
    dependency.analysisResultId,
    new Map(dependency.findings.map((finding) => [finding.findingId, finding]))
  ]));
}

/** Build immutable, minimal MP-03 contexts and MP-01-compatible deterministic fallbacks. */
export function buildMigrationTaskContexts(artifacts, options = {}) {
  if (!artifacts.upgradeDecision) {
    if (options.allowLegacyWithoutDecision === true) {
      // Historical evaluation-only behavior. V2 assembly requires decision lineage.
    } else {
      const error = new Error(
        'Migration Checklist input error: persisted authoritative Upgrade Decision is required.'
      );
      error.code = 'UPGRADE_DECISION_REQUIRED';
      throw error;
    }
  }
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
  const decisionsByResult = new Map((artifacts.upgradeDecision?.decisions ?? []).map((decision) => [
    decision.analysisResultId,
    decision
  ]));
  const verificationByProject = options.verificationByProject ?? new Map();

  for (const result of artifacts.versionAnalysis.results) {
    const upgradeDecision = decisionsByResult.get(result.id);
    if (!upgradeDecision && artifacts.upgradeDecision) {
      throw new Error(`Migration Checklist input error: no Upgrade Decision for ${result.id}.`);
    }
    const handoff = upgradeDecision
      ? handoffBasis(
          upgradeDecision,
          affectedAreasFor(artifacts, upgradeDecision),
          verificationByProject.get(result.dependency.projectId) ?? unavailableProjectVerification(),
          officialEvidenceFor(artifacts, upgradeDecision.evidence.targetScopedRefs)
        )
      : null;
    if (upgradeDecision && !['PLAN_UPGRADE', 'UPGRADE_NOW'].includes(upgradeDecision.decision)) {
      fallbackRecords.push(upgradeDecisionFallback(result, upgradeDecision, handoff));
      if (upgradeDecision.decision === 'NOT_ANALYZED') summary.notAnalyzed += 1;
      else summary.noGroundedAction += 1;
      continue;
    }
    if (result.status !== 'analyzed') {
      fallbackRecords.push(notAnalyzedFallback(result, handoff));
      summary.notAnalyzed += 1;
      continue;
    }
    const breakingFindings = result.findings.filter((finding) => finding.kind === 'breakingChange');
    if (breakingFindings.length === 0) {
      fallbackRecords.push(noFindingFallback(result, handoff));
      summary.noGroundedAction += 1;
      continue;
    }
    const fallback = baseFallbackRecord(result, handoff);
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
      const locationState = locationEligibility(artifacts, result, locations, impactFinding);
      const limitations = sortedUniqueLimitations([
        ...upgradeDecision.limitations,
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
          decision: upgradeDecision,
          handoff,
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

  for (const decision of artifacts.upgradeDecision?.decisions ?? []) {
    if (decision.analysisResultId !== null) continue;
    const handoff = handoffBasis(
      decision,
      [],
      verificationByProject.get(decision.occurrence.projectId) ?? unavailableProjectVerification(),
      officialEvidenceFor(artifacts, decision.evidence.targetScopedRefs)
    );
    fallbackRecords.push(missingAnalysisFallback(decision, handoff));
    summary.notAnalyzed += 1;
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

/**
 * Load the seven legacy inputs plus the optional persisted Upgrade Decision, then
 * prepare contexts without AI or writes. Production analyze always supplies the decision.
 */
export async function prepareMigrationChecklistContexts(input, options = {}) {
  const artifacts = await loadMigrationChecklistInputs(input, options);
  const withDecision = await loadPersistedUpgradeDecision(input, artifacts, options);
  const repositoryRoot = typeof input === 'string'
    ? input
    : typeof input?.repositoryRoot === 'string'
      ? input.repositoryRoot
      : null;
  const verificationByProject = options.verificationByProject
    ?? await extractProjectVerification(repositoryRoot, withDecision.projectManifest, options);
  return buildMigrationTaskContexts(withDecision, { ...options, verificationByProject });
}
