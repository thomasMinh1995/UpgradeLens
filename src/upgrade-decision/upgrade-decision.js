import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalJsonBytes } from '../canonical-json.js';
import {
  ARTIFACT_GENERATOR_NAME,
  UPGRADE_DECISION_SCHEMA_VERSION,
  VERSION
} from '../constants.js';
import {
  EcosystemVersionError,
  getEcosystemVersionAdapter
} from '../ecosystem-version-adapter.js';
import { compareText, isSorted } from '../portable.js';

export const UPGRADE_DECISION_POLICY_ID = 'deterministic-upgrade-decision';
export const UPGRADE_DECISION_POLICY_VERSION = '1.1.0';
export const UPGRADE_DECISIONS = Object.freeze([
  'KEEP_CURRENT',
  'UPGRADE_NOW',
  'PLAN_UPGRADE',
  'INVESTIGATE',
  'INSUFFICIENT_EVIDENCE',
  'NOT_ANALYZED'
]);

const schema = JSON.parse(await readFile(
  new URL('../../schemas/upgrade-decision.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

const compareDecisions = (left, right) => (
  compareText(left.occurrence.projectId, right.occurrence.projectId)
  || compareText(left.occurrence.manifest, right.occurrence.manifest)
  || compareText(left.occurrence.dependencyType, right.occurrence.dependencyType)
  || compareText(left.occurrence.packageId, right.occurrence.packageId)
  || compareText(left.analysisResultId ?? '', right.analysisResultId ?? '')
);
const compareLimitations = (left, right) => (
  compareText(left.code, right.code) || compareText(left.message, right.message)
);

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

function decisionId(input, occurrence, analysisResultId) {
  return digest({
    inputDigests: Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, value.artifactDigest])
    ),
    occurrence,
    analysisResultId,
    policy: `${UPGRADE_DECISION_POLICY_ID}@${UPGRADE_DECISION_POLICY_VERSION}`
  });
}

function sortedUniqueText(values) {
  return [...new Set(values)].sort(compareText);
}

function sortedUniqueLimitations(values) {
  const unique = new Map(values.map((value) => [`${value.code}\0${value.message}`, value]));
  return [...unique.values()].sort(compareLimitations);
}

function limitation(code, message) {
  return { code, message };
}

function adapterMetadata(adapter) {
  return adapter ? { ecosystem: adapter.ecosystem, contractVersion: '1' } : null;
}

function impactFor(impactEvidence, result) {
  const impact = impactEvidence.get(result.id);
  const breakingFindingCount = result.findings.filter((finding) => finding.kind === 'breakingChange').length;
  return {
    status: impact?.status ?? 'NOT_ANALYZED',
    reasonCode: impact?.reasonCode ?? null,
    repositorySensitiveFindingCount: breakingFindingCount,
    coverage: {
      status: impact?.coverage?.status ?? 'missing',
      reasonCode: impact?.coverage?.reasonCode ?? null
    }
  };
}

function referencedEvidenceIds(result) {
  return sortedUniqueText([
    ...result.summaryEvidenceRefs,
    ...result.riskEvidenceRefs,
    ...result.findings.flatMap((finding) => finding.evidenceRefs)
  ]);
}

function evidenceFor(artifacts, result) {
  const bundleById = new Map(artifacts.knowledgeEvidenceBundle.evidence.map((item) => [item.id, item]));
  const sourceById = new Map(artifacts.knowledgeManifest.sources.map((source) => [source.id, source]));
  const warningMatches = (code, source) => artifacts.knowledgeManifest.warnings.some((warning) => (
    warning.code === code
    && (!warning.packageId || warning.packageId === result.dependency.packageId)
    && (!warning.sourceId || warning.sourceId === source.id)
  ));
  const refs = referencedEvidenceIds(result);
  let conflicted = result.validation.warningCodes.includes('SOURCE_CONFLICT')
    || result.limitations.some((item) => item.code === 'SOURCE_CONFLICT');
  let stale = result.validation.warningCodes.includes('CACHE_EXPIRED')
    || result.limitations.some((item) => item.code === 'CACHE_EXPIRED');
  const targetScopedRefs = [];
  for (const ref of refs) {
    const item = bundleById.get(ref);
    const source = item ? sourceById.get(item.sourceId) : null;
    if (!item || !source) continue;
    conflicted ||= (source.conflictsWith?.length ?? 0) > 0 || warningMatches('SOURCE_CONFLICT', source);
    stale ||= source.status === 'stale'
      || source.snapshot?.freshness === 'stale'
      || warningMatches('CACHE_EXPIRED', source);
    const official = ['official', 'publisher'].includes(source.trust)
      && ['officialProject', 'publisherProvided'].includes(source.authority)
      && !['registry', 'community'].includes(source.kind);
    if (official
        && source.status === 'available'
        && result.versions.targetVersion !== null
        && item.releaseVersions.includes(result.versions.targetVersion)) {
      targetScopedRefs.push(ref);
    }
  }
  const sufficient = result.evidenceCoverage === 'sufficient'
    && targetScopedRefs.length > 0
    && !conflicted
    && !stale;
  return {
    status: conflicted ? 'conflicted' : sufficient ? 'sufficient' : 'insufficient',
    targetScopedRefs: sortedUniqueText(targetScopedRefs),
    hasReferencedEvidence: refs.length > 0,
    conflicted,
    stale
  };
}

function comparisonFor(result, adapters) {
  const versions = result.versions;
  const installedVersionStatus = versions.installedVersionStatus
    ?? (Object.hasOwn(versions, 'installedVersion') ? 'unresolved' : 'legacyMissing');
  const base = {
    declaredVersion: versions.declaredVersion,
    installedVersion: versions.installedVersion ?? null,
    installedVersionStatus,
    targetVersion: versions.targetVersion,
    targetPolicy: versions.targetPolicy,
    comparison: 'unknown',
    adapter: null
  };
  if (installedVersionStatus !== 'resolved' || !versions.installedVersion || !versions.targetVersion) {
    return { versions: base, adapter: null };
  }
  try {
    const adapter = getEcosystemVersionAdapter(result.dependency.ecosystem, adapters);
    const compared = adapter.compareVersions(versions.installedVersion, versions.targetVersion);
    const comparison = compared.direction === 'same'
      ? 'equal'
      : compared.direction === 'upgrade'
        ? 'targetNewer'
        : compared.direction === 'downgrade'
          ? 'installedNewer'
          : 'incomparable';
    return {
      versions: { ...base, comparison, adapter: adapterMetadata(adapter) },
      adapter
    };
  } catch (error) {
    if (!(error instanceof EcosystemVersionError)) throw error;
    return { versions: { ...base, comparison: 'incomparable' }, adapter: null };
  }
}

function coverageReason(impact) {
  if (impact.coverage.status === 'partial') return 'USAGE_COVERAGE_PARTIAL';
  if (['unavailable', 'failed', 'missing'].includes(impact.coverage.status)) {
    return 'USAGE_COVERAGE_UNAVAILABLE';
  }
  return null;
}

function providerRejected(result) {
  return [...result.humanReviewReasons, ...result.limitations.map((item) => item.code)]
    .some((value) => /PROVIDER|REJECT/i.test(value));
}

function recommendationDriverFor(result) {
  return result.versions.targetPolicy === 'explicit' ? 'USER_SELECTED_TARGET' : null;
}

function decide(result, comparison, evidence, impact) {
  const { versions } = comparison;
  const limitations = [];
  const coverageCode = coverageReason(impact);
  if (coverageCode) {
    limitations.push(limitation(
      coverageCode,
      'Repository usage coverage is incomplete; repository-sensitive conclusions remain bounded.'
    ));
  }
  if (versions.targetPolicy === 'registryLatest') {
    limitations.push(limitation(
      'REGISTRY_LATEST_IS_NOT_RECOMMENDATION',
      'Registry latest is a candidate fact and is not independently an upgrade recommendation.'
    ));
  }

  if (result.status !== 'analyzed') {
    const failed = result.status === 'failed';
    const reasons = [failed ? 'VERSION_ANALYSIS_FAILED' : 'VERSION_ANALYSIS_SKIPPED'];
    if (failed && providerRejected(result)) reasons.push('PROVIDER_REJECTED');
    return {
      decision: 'NOT_ANALYZED',
      primaryReasonCode: reasons[0],
      reasonCodes: reasons,
      summary: 'No upgrade decision was evaluated because Version Analysis did not complete.',
      limitations
    };
  }
  if (result.versions.installedVersionReason === 'NON_REGISTRY_DEPENDENCY') {
    return {
      decision: 'INVESTIGATE',
      primaryReasonCode: 'NON_REGISTRY_DEPENDENCY',
      reasonCodes: ['NON_REGISTRY_DEPENDENCY'],
      summary: 'Manual investigation is required for a non-registry dependency baseline.',
      limitations
    };
  }
  if (versions.installedVersionStatus !== 'resolved' || versions.installedVersion === null) {
    return {
      decision: 'INSUFFICIENT_EVIDENCE',
      primaryReasonCode: 'INSTALLED_VERSION_UNAVAILABLE',
      reasonCodes: ['INSTALLED_VERSION_UNAVAILABLE'],
      summary: 'The installed version baseline is unavailable.',
      limitations
    };
  }
  if (versions.targetVersion === null) {
    return {
      decision: 'INSUFFICIENT_EVIDENCE',
      primaryReasonCode: 'TARGET_VERSION_UNAVAILABLE',
      reasonCodes: ['TARGET_VERSION_UNAVAILABLE'],
      summary: 'No evaluated target version is available.',
      limitations
    };
  }
  if (versions.adapter === null || versions.comparison === 'incomparable') {
    const reason = comparison.adapter === null
      && !['node', 'python'].includes(result.dependency.ecosystem)
      ? 'UNSUPPORTED_ECOSYSTEM'
      : 'VERSION_INCOMPARABLE';
    return {
      decision: 'INVESTIGATE',
      primaryReasonCode: reason,
      reasonCodes: [reason],
      summary: 'Installed and target versions cannot be compared by the ecosystem adapter.',
      limitations
    };
  }
  if (versions.comparison === 'equal') {
    const reasons = [
      'ALREADY_AT_TARGET',
      ...(coverageCode ? [coverageCode] : []),
      ...(evidence.conflicted ? ['EVIDENCE_CONFLICT', 'SOURCE_CONFLICT'] : []),
      ...(evidence.stale ? ['STALE_EVIDENCE'] : [])
    ];
    if (evidence.conflicted || evidence.stale) {
      limitations.push(limitation(
        evidence.conflicted ? 'EVIDENCE_CONFLICT' : 'STALE_EVIDENCE',
        'The no-version-change conclusion is exact, but upstream evidence still requires review.'
      ));
    }
    return {
      decision: 'KEEP_CURRENT',
      primaryReasonCode: 'ALREADY_AT_TARGET',
      reasonCodes: reasons,
      summary: `Keep the installed version; it already equals target ${versions.targetVersion}.`,
      limitations
    };
  }
  if (versions.comparison === 'installedNewer') {
    limitations.push(limitation(
      'INSTALLED_NEWER_THAN_TARGET',
      'The installed version is newer than the evaluated target; this does not establish future safety.'
    ));
    return {
      decision: 'KEEP_CURRENT',
      primaryReasonCode: 'INSTALLED_NEWER_THAN_TARGET',
      reasonCodes: [
        'INSTALLED_NEWER_THAN_TARGET',
        ...(coverageCode ? [coverageCode] : []),
        ...(evidence.conflicted ? ['EVIDENCE_CONFLICT', 'SOURCE_CONFLICT'] : []),
        ...(evidence.stale ? ['STALE_EVIDENCE'] : [])
      ],
      summary: 'Keep the installed version because it is newer than the evaluated target.',
      limitations
    };
  }
  if (evidence.conflicted) {
    return {
      decision: 'INVESTIGATE',
      primaryReasonCode: 'EVIDENCE_CONFLICT',
      reasonCodes: ['EVIDENCE_CONFLICT', 'SOURCE_CONFLICT'],
      summary: 'Manual investigation is required because target evidence is conflicted.',
      limitations
    };
  }
  if (evidence.status === 'insufficient' && evidence.hasReferencedEvidence) {
    const reasons = ['EVIDENCE_INSUFFICIENT', ...(evidence.stale ? ['STALE_EVIDENCE'] : [])];
    return {
      decision: 'INSUFFICIENT_EVIDENCE',
      primaryReasonCode: 'EVIDENCE_INSUFFICIENT',
      reasonCodes: reasons,
      summary: 'Referenced evidence is invalid or insufficient for an upgrade plan.',
      limitations
    };
  }
  const recommendationDriver = recommendationDriverFor(result);
  if (recommendationDriver === null) {
    limitations.push(limitation(
      'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER',
      'A newer target is available, but no verified reason to recommend upgrading was provided.'
    ));
    return {
      decision: 'INVESTIGATE',
      primaryReasonCode: 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER',
      reasonCodes: ['UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER'],
      summary: 'A newer target is available, but no structured recommendation driver is present.',
      limitations
    };
  }
  if (evidence.status !== 'sufficient') {
    const reasons = ['EVIDENCE_INSUFFICIENT', ...(evidence.stale ? ['STALE_EVIDENCE'] : [])];
    return {
      decision: 'INSUFFICIENT_EVIDENCE',
      primaryReasonCode: 'EVIDENCE_INSUFFICIENT',
      reasonCodes: reasons,
      summary: 'Target-scoped official evidence is insufficient for an upgrade plan.',
      limitations
    };
  }
  if (impact.repositorySensitiveFindingCount > 0 && coverageCode) {
    return {
      decision: 'INVESTIGATE',
      primaryReasonCode: coverageCode,
      reasonCodes: [coverageCode],
      summary: 'Manual investigation is required because repository-sensitive findings lack complete coverage.',
      limitations
    };
  }
  return {
    decision: 'PLAN_UPGRADE',
    primaryReasonCode: recommendationDriver,
    reasonCodes: [recommendationDriver, 'TARGET_NEWER_EVIDENCE_AVAILABLE'],
    summary: `Plan the caller-selected, evidence-bounded upgrade to target ${versions.targetVersion}.`,
    limitations
  };
}

function decisionRecord(artifacts, result, impactEvidence, adapters) {
  const comparison = comparisonFor(result, adapters);
  const evidence = result.status === 'analyzed'
    ? evidenceFor(artifacts, result)
    : {
        status: 'notEvaluated',
        targetScopedRefs: [],
        hasReferencedEvidence: false,
        conflicted: false,
        stale: false
      };
  const impact = impactFor(impactEvidence, result);
  const outcome = decide(result, comparison, evidence, impact);
  const occurrence = structuredClone(result.dependency);
  const provenance = {
    policyId: UPGRADE_DECISION_POLICY_ID,
    policyVersion: UPGRADE_DECISION_POLICY_VERSION,
    versionAdapter: adapterMetadata(comparison.adapter),
    analysisResultId: result.id
  };
  const id = decisionId(artifacts.input, occurrence, result.id);
  return {
    id,
    analysisResultId: result.id,
    occurrence,
    decision: outcome.decision,
    summary: outcome.summary,
    primaryReasonCode: outcome.primaryReasonCode,
    reasonCodes: sortedUniqueText(outcome.reasonCodes),
    versions: comparison.versions,
    evidence: {
      status: evidence.status,
      targetScopedRefs: evidence.targetScopedRefs
    },
    impact,
    requiresHumanReview: !(outcome.decision === 'KEEP_CURRENT'
        && comparison.versions.comparison === 'equal')
      || evidence.conflicted
      || result.validation.status === 'invalid',
    provenance,
    limitations: sortedUniqueLimitations(outcome.limitations)
  };
}

function occurrenceKey(value) {
  return [
    value.projectId,
    value.manifest,
    value.dependencyType ?? value.type,
    value.declaredName ?? value.name,
    value.normalizedName,
    value.declaredVersion ?? value.versions?.declaredVersion ?? ''
  ].join('\0');
}

function canonicalOccurrences(artifacts) {
  if (!Array.isArray(artifacts.knowledgeManifest.packages)) {
    return artifacts.versionAnalysis.results.map((result) => ({
      occurrence: result.dependency,
      declaredVersion: result.versions.declaredVersion
    }));
  }
  const projects = new Map(artifacts.projectManifest.projects.map((project) => [project.id, project]));
  return artifacts.knowledgeManifest.packages.flatMap((packageRecord) => (
    packageRecord.occurrences.map((item) => {
      const project = projects.get(item.projectId);
      const dependency = project.dependencies.find((candidate) => (
        candidate.manifest === item.manifest
        && candidate.type === item.dependencyType
        && candidate.name === item.declaredName
        && candidate.normalizedName === packageRecord.identity.normalizedName
        && (candidate.declaredVersion ?? null) === (item.declaredVersion ?? null)
      ));
      return {
        occurrence: {
          projectId: item.projectId,
          packageId: packageRecord.id,
          declaredName: item.declaredName,
          normalizedName: packageRecord.identity.normalizedName,
          ecosystem: packageRecord.ecosystem,
          registry: packageRecord.identity.registry,
          packageManager: project.packageManager?.name ?? null,
          dependencyType: item.dependencyType,
          manifest: item.manifest
        },
        declaredVersion: item.declaredVersion ?? null,
        installedVersion: dependency.installedVersion ?? null,
        installedVersionStatus: dependency.installedVersionStatus ?? 'legacyMissing'
      };
    })
  ));
}

function missingAnalysisDecision(artifacts, item) {
  const occurrence = structuredClone(item.occurrence);
  const versions = {
    declaredVersion: item.declaredVersion,
    installedVersion: item.installedVersion ?? null,
    installedVersionStatus: item.installedVersionStatus ?? 'legacyMissing',
    targetVersion: null,
    targetPolicy: 'registryLatest',
    comparison: 'unknown',
    adapter: null
  };
  const provenance = {
    policyId: UPGRADE_DECISION_POLICY_ID,
    policyVersion: UPGRADE_DECISION_POLICY_VERSION,
    versionAdapter: null,
    analysisResultId: null
  };
  return {
    id: decisionId(artifacts.input, occurrence, null),
    analysisResultId: null,
    occurrence,
    decision: 'NOT_ANALYZED',
    summary: 'No Version Analysis result exists for this validated dependency occurrence.',
    primaryReasonCode: 'VERSION_ANALYSIS_MISSING',
    reasonCodes: ['VERSION_ANALYSIS_MISSING'],
    versions,
    evidence: { status: 'notEvaluated', targetScopedRefs: [] },
    impact: {
      status: 'NOT_ANALYZED',
      reasonCode: null,
      repositorySensitiveFindingCount: 0,
      coverage: { status: 'missing', reasonCode: null }
    },
    requiresHumanReview: true,
    provenance,
    limitations: [limitation(
      'VERSION_ANALYSIS_MISSING',
      'The occurrence has no Version Analysis result and cannot produce an upgrade action.'
    )]
  };
}

function buildSummary(decisions) {
  const summary = Object.fromEntries(UPGRADE_DECISIONS.map((decision) => [decision, 0]));
  for (const record of decisions) summary[record.decision] += 1;
  return {
    dependencyCount: decisions.length,
    ...summary,
    requiresHumanReviewCount: decisions.filter((record) => record.requiresHumanReview).length
  };
}

export function validateUpgradeDecisionInvariants(artifact) {
  const errors = [];
  if (!isSorted(artifact.decisions, compareDecisions)) errors.push('decisions must be sorted.');
  if (new Set(artifact.decisions.map((record) => record.id)).size !== artifact.decisions.length) {
    errors.push('decision ids must be unique.');
  }
  const resultIds = artifact.decisions
    .map((record) => record.analysisResultId)
    .filter((value) => value !== null);
  if (new Set(resultIds).size !== resultIds.length) {
    errors.push('analysisResultIds must be unique.');
  }
  const expectedSummary = buildSummary(artifact.decisions);
  if (JSON.stringify(artifact.summary) !== JSON.stringify(expectedSummary)) {
    errors.push('summary is inconsistent.');
  }
  for (const record of artifact.decisions) {
    if (!isSorted(record.reasonCodes, compareText)) {
      errors.push(`reasonCodes for ${record.id} must be sorted.`);
    }
    if (record.decision === 'UPGRADE_NOW') {
      errors.push('UPGRADE_NOW is unavailable without a structured urgency contract.');
    }
    if (record.id !== decisionId(artifact.input, record.occurrence, record.analysisResultId)) {
      errors.push(`decision ${record.id} has an unstable id.`);
    }
    if (!record.reasonCodes.includes(record.primaryReasonCode)) {
      errors.push(`decision ${record.id} primaryReasonCode is not present in reasonCodes.`);
    }
    if (!isSorted(record.evidence.targetScopedRefs, compareText)) {
      errors.push(`evidence refs for ${record.id} must be sorted.`);
    }
    if (!isSorted(record.limitations, compareLimitations)) {
      errors.push(`limitations for ${record.id} must be sorted.`);
    }
    if (record.decision === 'KEEP_CURRENT'
        && !['equal', 'installedNewer'].includes(record.versions.comparison)) {
      errors.push(`KEEP_CURRENT ${record.id} has an invalid comparison.`);
    }
    if (record.decision !== 'KEEP_CURRENT' && !record.requiresHumanReview) {
      errors.push(`decision ${record.id} must require human review.`);
    }
    if (record.decision === 'PLAN_UPGRADE'
        && (record.versions.targetPolicy !== 'explicit'
          || record.versions.comparison !== 'targetNewer'
          || record.evidence.status !== 'sufficient'
          || record.primaryReasonCode !== 'USER_SELECTED_TARGET'
          || !record.reasonCodes.includes('USER_SELECTED_TARGET'))) {
      errors.push(`PLAN_UPGRADE ${record.id} lacks a structured user-selected target driver.`);
    }
    if (record.decision === 'KEEP_CURRENT'
        && record.versions.comparison === 'installedNewer'
        && !record.requiresHumanReview) {
      errors.push(`installed-newer decision ${record.id} must require human review.`);
    }
  }
  return errors.sort(compareText);
}

export function validateUpgradeDecision(artifact) {
  if (artifact?.schemaVersion !== UPGRADE_DECISION_SCHEMA_VERSION) {
    throw new Error(
      `Upgrade Decision validation error: unsupported schema version; expected ${UPGRADE_DECISION_SCHEMA_VERSION}.`
    );
  }
  if (!validateSchema(artifact)) {
    throw new Error(
      `Upgrade Decision validation error: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`
    );
  }
  const errors = validateUpgradeDecisionInvariants(artifact);
  if (errors.length > 0) {
    throw new Error(`Upgrade Decision validation error: ${errors.join(' ')}`);
  }
  return artifact;
}

export function buildUpgradeDecision(artifacts, options = {}) {
  const impactEvidence = new Map(artifacts.repositoryImpactEvidence.dependencies.map((dependency) => [
    dependency.analysisResultId,
    dependency
  ]));
  const resultsByOccurrence = new Map(artifacts.versionAnalysis.results.map((result) => [
    occurrenceKey({ ...result.dependency, declaredVersion: result.versions.declaredVersion }),
    result
  ]));
  const decisions = canonicalOccurrences(artifacts)
    .map((item) => {
      const result = resultsByOccurrence.get(occurrenceKey({
        ...item.occurrence,
        declaredVersion: item.declaredVersion
      }));
      return result
        ? decisionRecord(artifacts, result, impactEvidence, options.adapters)
        : missingAnalysisDecision(artifacts, item);
    })
    .sort(compareDecisions);
  const artifact = {
    schemaVersion: UPGRADE_DECISION_SCHEMA_VERSION,
    generatedAt: artifacts.repositoryImpactEvidence.generatedAt,
    generator: { name: ARTIFACT_GENERATOR_NAME, version: VERSION },
    input: structuredClone(artifacts.input),
    policy: {
      id: UPGRADE_DECISION_POLICY_ID,
      version: UPGRADE_DECISION_POLICY_VERSION,
      urgencyContract: 'unavailable'
    },
    summary: buildSummary(decisions),
    decisions
  };
  return validateUpgradeDecision(artifact);
}
