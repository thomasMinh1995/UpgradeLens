import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalJsonBytes } from '../canonical-json.js';
import {
  MIGRATION_CHECKLIST_SCHEMA_VERSION,
  ARTIFACT_GENERATOR_NAME,
  VERSION
} from '../constants.js';
import { compareText, isSorted } from '../portable.js';
import {
  MIGRATION_CHECKLIST_STATUSES,
  isActionableMigrationChecklistItem,
  migrationChecklistEligibility,
  migrationChecklistStatusForEligibility,
  validateMigrationChecklistInstructionContent
} from './grounding-policy.js';

const schema = JSON.parse(await readFile(
  new URL('../../schemas/migration-checklist.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

const compareDependencies = (left, right) => (
  compareText(left.dependency.projectId, right.dependency.projectId)
  || compareText(left.dependency.manifest, right.dependency.manifest)
  || compareText(left.dependency.dependencyType, right.dependency.dependencyType)
  || compareText(left.dependency.packageId, right.dependency.packageId)
  || compareText(left.versions.declaredVersion ?? '', right.versions.declaredVersion ?? '')
  || compareText(left.versions.targetVersion ?? '', right.versions.targetVersion ?? '')
  || compareText(left.analysisResultId ?? '', right.analysisResultId ?? '')
  || compareText(left.decisionId ?? '', right.decisionId ?? '')
);
const compareFindings = (left, right) => compareText(left.id, right.id);
const compareItems = (left, right) => compareText(left.id, right.id);
const compareLocations = (left, right) => (
  compareText(left.impactEvidenceId, right.impactEvidenceId)
  || compareText(left.symbol, right.symbol)
  || compareText(left.file, right.file)
);
const compareLimitations = (left, right) => (
  compareText(left.code, right.code) || compareText(left.message, right.message)
);
const compareAffectedAreas = (left, right) => (
  compareText(left.impactEvidenceId, right.impactEvidenceId)
  || compareText(left.findingId, right.findingId)
  || compareText(left.symbol, right.symbol)
  || compareText(left.file, right.file)
);
const compareVerificationCommands = (left, right) => (
  compareText(left.role, right.role)
  || compareText(left.workingDirectory, right.workingDirectory)
  || compareText(left.command, right.command)
  || compareText(left.id, right.id)
);

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

function sortedText(values = []) {
  return [...values].sort(compareText);
}

function sortedLocations(locations = []) {
  return structuredClone(locations).sort(compareLocations);
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort(compareText);
}

function locationKey(location) {
  return `${location.impactEvidenceId}\0${location.symbol}\0${location.file}`;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function expectedFindingState(reasonCode) {
  return {
    status: migrationChecklistStatusForEligibility(reasonCode),
    eligibility: migrationChecklistEligibility(reasonCode)
  };
}

function expectedDependencyState(analysisStatus, findings) {
  if (analysisStatus !== 'analyzed') {
    return {
      status: 'NOT_ANALYZED',
      eligibility: migrationChecklistEligibility('NOT_ANALYZED')
    };
  }
  if (findings.length === 0 || findings.every((finding) => finding.status === 'NO_GROUNDED_ACTION')) {
    return {
      status: 'NO_GROUNDED_ACTION',
      eligibility: migrationChecklistEligibility('NO_GROUNDED_ACTION')
    };
  }
  if (findings.every((finding) => finding.status === 'COMPLETE')) {
    return {
      status: 'COMPLETE',
      eligibility: migrationChecklistEligibility('ELIGIBLE')
    };
  }
  const reasons = new Set(findings.map((finding) => finding.eligibility.reasonCode));
  const reasonCode = reasons.has('INVALID_OR_CONFLICTED_EVIDENCE')
    ? 'INVALID_OR_CONFLICTED_EVIDENCE'
    : reasons.has('UNSUPPORTED_USAGE_COVERAGE')
      ? 'UNSUPPORTED_USAGE_COVERAGE'
      : 'MANUAL_REVIEW_REQUIRED';
  return {
    status: 'INCOMPLETE',
    eligibility: migrationChecklistEligibility(reasonCode)
  };
}

function expectedOverallStatus(dependencies) {
  if (dependencies.length === 0) return 'NO_GROUNDED_ACTION';
  if (dependencies.every((dependency) => dependency.status === 'COMPLETE')) return 'COMPLETE';
  if (dependencies.every((dependency) => dependency.status === 'NOT_ANALYZED')) return 'NOT_ANALYZED';
  if (dependencies.every((dependency) => dependency.status === 'NO_GROUNDED_ACTION')) {
    return 'NO_GROUNDED_ACTION';
  }
  return 'INCOMPLETE';
}

function checklistSummary(dependencies, limitations) {
  const findings = dependencies.flatMap((dependency) => dependency.findings);
  const items = findings.flatMap((finding) => finding.items);
  const statusCounts = Object.fromEntries(MIGRATION_CHECKLIST_STATUSES.map((status) => [
    status,
    dependencies.filter((dependency) => dependency.status === status).length
  ]));
  const handoffStatusCounts = Object.fromEntries([
    'NO_VERSION_CHANGE_REQUIRED',
    'ACTIONABLE_WITH_REVIEW',
    'INVESTIGATION_REQUIRED',
    'INSUFFICIENT_EVIDENCE',
    'NOT_ANALYZED',
    'ACTION_GENERATION_FAILED',
    'NO_GROUNDED_ACTION'
  ].map((status) => [
    status,
    dependencies.filter((dependency) => dependency.handoff.status === status).length
  ]));
  return {
    dependencyCount: dependencies.length,
    findingCount: findings.length,
    itemCount: items.length,
    groundedActionCount: items.filter((item) => isActionableMigrationChecklistItem(item.kind)).length,
    aiAuthoredItemCount: items.filter((item) => item.basis === 'AI_AUTHORED').length,
    candidateLocationCount: items.reduce((count, item) => count + item.candidateLocations.length, 0),
    requiresHumanReviewItemCount: items.filter((item) => item.requiresHumanReview).length,
    limitationCount: limitations.length
      + dependencies.reduce((count, dependency) => count + dependency.limitations.length, 0),
    statusCounts,
    handoffStatusCounts
  };
}

function itemIdMaterial(analysisResultId, findingId, item) {
  return {
    analysisResultId,
    findingId,
    kind: item.kind,
    basis: item.basis,
    instruction: item.instruction,
    evidenceRefs: sortedText(item.evidenceRefs),
    candidateLocations: sortedLocations(item.candidateLocations),
    requiresHumanReview: item.requiresHumanReview
  };
}

export function migrationChecklistItemId(analysisResultId, findingId, item) {
  return digest(itemIdMaterial(analysisResultId, findingId, item));
}

function normalizeItem(analysisResultId, findingId, item) {
  const normalized = {
    kind: item.kind,
    basis: item.basis,
    instruction: item.instruction,
    findingId: item.findingId,
    evidenceRefs: sortedText(item.evidenceRefs),
    candidateLocations: sortedLocations(item.candidateLocations),
    requiresHumanReview: item.requiresHumanReview
  };
  return {
    id: migrationChecklistItemId(analysisResultId, findingId, normalized),
    ...normalized
  };
}

function normalizeFinding(analysisResultId, finding) {
  const reasonCode = finding.eligibilityReasonCode ?? finding.eligibility?.reasonCode;
  const state = expectedFindingState(reasonCode);
  return {
    id: finding.id,
    kind: finding.kind,
    summary: finding.summary,
    ...state,
    evidenceRefs: sortedText(finding.evidenceRefs),
    positiveImpactLocations: sortedLocations(finding.positiveImpactLocations),
    items: (finding.items ?? [])
      .map((item) => normalizeItem(analysisResultId, finding.id, item))
      .sort(compareItems)
  };
}

const GENERATION_FAILURE_CODES = new Set([
  'AI_RUNTIME_FAILED',
  'EVIDENCE_REFERENCE_INVALID',
  'OUTPUT_JSON_INVALID',
  'OUTPUT_SCHEMA_INVALID',
  'OUTPUT_SEMANTICS_INVALID',
  'PROHIBITED_CAPABILITY',
  'SUPPORTING_EXCERPT_INVALID',
  'TRUST_VALIDATION_REJECTED'
]);

function handoffStatus(record, findings) {
  const decision = record.decision.status;
  if (decision === 'KEEP_CURRENT') return 'NO_VERSION_CHANGE_REQUIRED';
  if (decision === 'INVESTIGATE') return 'INVESTIGATION_REQUIRED';
  if (decision === 'INSUFFICIENT_EVIDENCE') return 'INSUFFICIENT_EVIDENCE';
  if (decision === 'NOT_ANALYZED') return 'NOT_ANALYZED';
  const hasFailure = record.limitations.some((item) => GENERATION_FAILURE_CODES.has(item.code));
  if (hasFailure) return 'ACTION_GENERATION_FAILED';
  const hasAction = findings.some((finding) => finding.items.some((item) => (
    item.kind === 'REVIEW_MIGRATION_INSTRUCTION' && item.basis === 'AI_AUTHORED'
  )));
  return hasAction ? 'ACTIONABLE_WITH_REVIEW' : 'NO_GROUNDED_ACTION';
}

function normalizeVerification(record) {
  if (!['PLAN_UPGRADE', 'UPGRADE_NOW'].includes(record.decision.status)) {
    return { status: 'NOT_APPLICABLE', commands: [], limitation: null };
  }
  const verification = structuredClone(record.verification);
  verification.commands.sort(compareVerificationCommands);
  return verification;
}

function normalizeHandoff(record, findings) {
  return {
    status: handoffStatus(record, findings),
    affectedAreas: structuredClone(record.affectedAreas).sort(compareAffectedAreas),
    coverage: structuredClone(record.coverage),
    verification: normalizeVerification(record),
    officialEvidence: structuredClone(record.officialEvidence)
      .sort((left, right) => compareText(left.id, right.id)),
    preconditions: structuredClone(record.preconditions)
      .sort((left, right) => compareText(left.code, right.code)),
    recovery: structuredClone(record.recovery),
    reviewQuestions: [...record.reviewQuestions].sort(compareText),
    missingInformation: structuredClone(record.missingInformation)
      .sort((left, right) => compareText(left.code, right.code)),
    nextStep: structuredClone(record.nextStep),
    humanReviewRequired: record.humanReviewRequired
  };
}

function normalizeDependency(record) {
  const findings = (record.findings ?? [])
    .map((finding) => normalizeFinding(record.analysisResultId, finding))
    .sort(compareFindings);
  const state = expectedDependencyState(record.analysisStatus, findings);
  return {
    analysisResultId: record.analysisResultId,
    decisionId: record.decisionId,
    decision: {
      ...structuredClone(record.decision),
      reasonCodes: sortedText(record.decision.reasonCodes)
    },
    handoff: normalizeHandoff(record, findings),
    dependency: structuredClone(record.dependency),
    versions: structuredClone(record.versions),
    analysisStatus: record.analysisStatus,
    ...state,
    selectedEvidenceRefs: sortedText(record.selectedEvidenceRefs),
    findings,
    limitations: structuredClone(record.limitations ?? []).sort(compareLimitations)
  };
}

function validateVersionSemantics(record, errors) {
  const versions = record.versions;
  const installedFields = [
    'installedVersion',
    'installedVersionStatus',
    'installedVersionSource',
    'installedVersionReason'
  ];
  const installedFieldCount = installedFields.filter((field) => field in versions).length;
  if (installedFieldCount !== 0 && installedFieldCount !== installedFields.length) {
    errors.push(`Dependency ${record.analysisResultId} has an incomplete installed-version baseline.`);
  }
  if (versions.analysisMode === 'exactBaseline') {
    if (versions.currentVersion === null || versions.currentVersionSource === null) {
      errors.push(`Dependency ${record.analysisResultId} exact baseline requires current version and source.`);
    }
  } else if (versions.currentVersion !== null || versions.currentVersionSource !== null) {
    errors.push(`Dependency ${record.analysisResultId} uncertain baseline cannot contain an exact current version.`);
  }
  if (versions.installedVersionStatus === 'resolved') {
    if (
      versions.currentVersion !== versions.installedVersion
      || versions.currentVersionSource !== 'resolvedArtifact'
      || versions.installedVersionSource === null
      || versions.installedVersionReason !== null
    ) {
      errors.push(`Dependency ${record.analysisResultId} does not preserve its resolved installed-version baseline.`);
    }
  } else if (
    versions.installedVersionStatus === 'unresolved'
    && (
      versions.installedVersion !== null
      || versions.installedVersionSource !== null
      || versions.installedVersionReason === null
    )
  ) {
    errors.push(`Dependency ${record.analysisResultId} has inconsistent unresolved installed-version fields.`);
  } else if (
    versions.installedVersionStatus === 'legacyMissing'
    && (
      versions.installedVersion !== null
      || versions.installedVersionSource !== null
      || versions.installedVersionReason !== null
      || record.analysisResultId !== null
    )
  ) {
    errors.push(`Dependency ${record.decisionId} has inconsistent legacy installed-version fields.`);
  }
}

function verificationCommandId(command) {
  const { id, ...material } = command;
  return digest(material);
}

function validateHandoff(record, errors) {
  const expectedStatus = handoffStatus({
    ...record,
    limitations: record.limitations
  }, record.findings);
  if (record.handoff.status !== expectedStatus) {
    errors.push(`Dependency ${record.decisionId} handoff status is inconsistent.`);
  }
  if (!isSorted(record.decision.reasonCodes, compareText)) {
    errors.push(`Dependency ${record.decisionId} decision reason codes must be sorted.`);
  }
  if (!record.decision.reasonCodes.includes(record.decision.primaryReasonCode)) {
    errors.push(`Dependency ${record.decisionId} decision primary reason is not present.`);
  }
  if (record.decision.targetOrigin !== record.versions.targetPolicy) {
    errors.push(`Dependency ${record.decisionId} target origin differs from version facts.`);
  }
  const migrationDecision = ['PLAN_UPGRADE', 'UPGRADE_NOW'].includes(record.decision.status);
  const aiActions = record.findings.flatMap((finding) => finding.items)
    .filter((item) => item.basis === 'AI_AUTHORED');
  if (!migrationDecision && aiActions.length > 0) {
    errors.push(`Dependency ${record.decisionId} has AI action under a non-actionable decision.`);
  }
  if (record.decision.status === 'PLAN_UPGRADE'
      && (record.decision.targetOrigin !== 'explicit'
        || record.decision.recommendationDriver !== 'USER_SELECTED_TARGET')) {
    errors.push(`Dependency ${record.decisionId} PLAN_UPGRADE lacks explicit target intent.`);
  }
  if (record.decision.status !== 'PLAN_UPGRADE'
      && record.decision.status !== 'UPGRADE_NOW'
      && record.decision.recommendationDriver !== null) {
    errors.push(`Dependency ${record.decisionId} has a recommendation driver on a non-actionable decision.`);
  }
  if (!isSorted(record.handoff.affectedAreas, compareAffectedAreas)) {
    errors.push(`Dependency ${record.decisionId} affected areas must be sorted.`);
  }
  if (!isSorted(record.handoff.verification.commands, compareVerificationCommands)) {
    errors.push(`Dependency ${record.decisionId} verification commands must be sorted.`);
  }
  if (!isSorted(record.handoff.officialEvidence, (left, right) => compareText(left.id, right.id))) {
    errors.push(`Dependency ${record.decisionId} official evidence must be sorted.`);
  }
  const selectedEvidence = new Set(record.selectedEvidenceRefs);
  if (record.handoff.officialEvidence.some((item) => !selectedEvidence.has(item.id))) {
    errors.push(`Dependency ${record.decisionId} handoff contains unselected official evidence.`);
  }
  if (!migrationDecision && record.handoff.verification.status !== 'NOT_APPLICABLE') {
    errors.push(`Dependency ${record.decisionId} has migration verification under a non-actionable decision.`);
  }
  if (record.handoff.verification.status === 'AVAILABLE'
      && record.handoff.verification.commands.length === 0) {
    errors.push(`Dependency ${record.decisionId} available verification has no commands.`);
  }
  if (record.handoff.verification.status === 'VERIFICATION_COMMAND_UNAVAILABLE'
      && (record.handoff.verification.commands.length > 0
        || record.handoff.verification.limitation?.code !== 'VERIFICATION_COMMAND_UNAVAILABLE')) {
    errors.push(`Dependency ${record.decisionId} unavailable verification is inconsistent.`);
  }
  for (const command of record.handoff.verification.commands) {
    if (command.id !== verificationCommandId(command)) {
      errors.push(`Verification command ${command.id} does not have a stable id.`);
    }
  }
  if (record.handoff.recovery.status !== 'RECOVERY_PLAN_NOT_PROVIDED'
      || record.handoff.recovery.evidenceRefs.length > 0) {
    errors.push(`Dependency ${record.decisionId} has an unsupported recovery plan.`);
  }
}

function validateFinding(record, finding, globalItemIds, errors) {
  const expected = expectedFindingState(finding.eligibility.reasonCode);
  if (finding.status !== expected.status || !sameJson(finding.eligibility, expected.eligibility)) {
    errors.push(`Finding ${record.analysisResultId}/${finding.id} status and eligibility are inconsistent.`);
  }
  if (record.analysisStatus === 'analyzed' && finding.status === 'NOT_ANALYZED') {
    errors.push(`Finding ${record.analysisResultId}/${finding.id} cannot be NOT_ANALYZED under an analyzed result.`);
  }
  if (!isSorted(finding.evidenceRefs, compareText)) {
    errors.push(`Finding ${record.analysisResultId}/${finding.id} evidenceRefs must be sorted.`);
  }
  if (!isSorted(finding.positiveImpactLocations, compareLocations)) {
    errors.push(`Finding ${record.analysisResultId}/${finding.id} positive impact locations must be sorted.`);
  }
  if (!isSorted(finding.items, compareItems)) {
    errors.push(`Finding ${record.analysisResultId}/${finding.id} items must be sorted by id.`);
  }

  const selectedEvidence = new Set(record.selectedEvidenceRefs);
  for (const ref of finding.evidenceRefs) {
    if (!selectedEvidence.has(ref)) {
      errors.push(`Finding ${record.analysisResultId}/${finding.id} references unknown selected evidence ${ref}.`);
    }
  }
  for (const duplicate of duplicateValues(finding.positiveImpactLocations.map(locationKey))) {
    errors.push(`Finding ${record.analysisResultId}/${finding.id} has duplicate positive impact location ${duplicate.replaceAll('\0', ' / ')}.`);
  }
  const allowedEvidence = new Set(finding.evidenceRefs);
  const allowedLocations = new Set(finding.positiveImpactLocations.map(locationKey));

  for (const item of finding.items) {
    if (globalItemIds.has(item.id)) errors.push(`Duplicate checklist item id ${item.id}.`);
    globalItemIds.add(item.id);
    if (item.findingId !== finding.id) {
      errors.push(`Checklist item ${item.id} references unknown finding ${item.findingId}.`);
    }
    const expectedId = migrationChecklistItemId(record.analysisResultId, finding.id, item);
    if (item.id !== expectedId) errors.push(`Checklist item ${item.id} does not have a stable id.`);
    if (!isSorted(item.evidenceRefs, compareText)) errors.push(`Checklist item ${item.id} evidenceRefs must be sorted.`);
    if (!isSorted(item.candidateLocations, compareLocations)) {
      errors.push(`Checklist item ${item.id} candidate locations must be sorted.`);
    }
    for (const ref of item.evidenceRefs) {
      if (!selectedEvidence.has(ref) || !allowedEvidence.has(ref)) {
        errors.push(`Checklist item ${item.id} references unknown evidence ${ref}.`);
      }
    }
    for (const location of item.candidateLocations) {
      if (!allowedLocations.has(locationKey(location))) {
        errors.push(`Checklist item ${item.id} references unknown positive impact evidence/location ${location.impactEvidenceId}.`);
      }
    }
    for (const violation of validateMigrationChecklistInstructionContent(item.instruction)) {
      errors.push(`Checklist item ${item.id} violates ${violation.code}: ${violation.message}`);
    }

    const actionable = isActionableMigrationChecklistItem(item.kind);
    if (actionable && item.evidenceRefs.length === 0) {
      errors.push(`Actionable checklist item ${item.id} requires at least one evidence reference.`);
    }
    if (item.kind === 'REVIEW_CANDIDATE_USAGE'
        && (item.basis !== 'DETERMINISTIC' || item.candidateLocations.length === 0)) {
      errors.push(`Candidate usage item ${item.id} must be deterministic and contain a positive candidate location.`);
    }
    if (item.kind !== 'REVIEW_CANDIDATE_USAGE' && item.candidateLocations.length > 0) {
      errors.push(`Checklist item ${item.id} cannot own candidate locations for kind ${item.kind}.`);
    }
    if (item.kind === 'MANUAL_REVIEW_REQUIRED'
        && (item.basis !== 'DETERMINISTIC' || item.candidateLocations.length > 0)) {
      errors.push(`Manual-review fallback ${item.id} must be deterministic and location-free.`);
    }
    if (item.basis === 'AI_AUTHORED') {
      if (finding.eligibility.reasonCode !== 'ELIGIBLE') {
        errors.push(`AI-authored checklist item ${item.id} is not allowed for an ineligible finding.`);
      }
      if (item.kind !== 'REVIEW_MIGRATION_INSTRUCTION') {
        errors.push(`AI-authored checklist item ${item.id} must be REVIEW_MIGRATION_INSTRUCTION.`);
      }
      if (item.evidenceRefs.length === 0) {
        errors.push(`AI-authored checklist item ${item.id} requires selected evidence.`);
      }
      if (item.candidateLocations.length > 0) {
        errors.push(`AI-authored checklist item ${item.id} cannot own repository locations.`);
      }
      if (item.requiresHumanReview !== true) {
        errors.push(`AI-authored checklist item ${item.id} must require human review.`);
      }
    }
  }

  const actionableItems = finding.items.filter((item) => isActionableMigrationChecklistItem(item.kind));
  const fallbackItems = finding.items.filter((item) => item.kind === 'MANUAL_REVIEW_REQUIRED');
  if (finding.eligibility.reasonCode === 'ELIGIBLE') {
    if (finding.evidenceRefs.length === 0 || actionableItems.length === 0) {
      errors.push(`Eligible finding ${record.analysisResultId}/${finding.id} requires evidence-grounded actionable items.`);
    }
    if (fallbackItems.length > 0) {
      errors.push(`Eligible finding ${record.analysisResultId}/${finding.id} cannot contain manual-review fallbacks.`);
    }
  } else if (finding.eligibility.reasonCode === 'NOT_ANALYZED') {
    if (finding.items.length > 0) {
      errors.push(`Not-analyzed finding ${record.analysisResultId}/${finding.id} cannot contain checklist items.`);
    }
  } else {
    if (actionableItems.length > 0 || fallbackItems.length === 0
        || finding.items.some((item) => item.basis === 'AI_AUTHORED')) {
      errors.push(`Ineligible finding ${record.analysisResultId}/${finding.id} may contain deterministic manual-review fallbacks only.`);
    }
  }
}

export function validateMigrationChecklistInvariants(checklist) {
  const errors = [];
  const dependencies = checklist.dependencies ?? [];
  if (!isSorted(dependencies, compareDependencies)) errors.push('dependencies must be deterministically sorted.');
  if (!isSorted(checklist.limitations ?? [], compareLimitations)) errors.push('limitations must be sorted.');
  if (!sameJson(checklist.repository, checklist.input?.projectManifest?.repository)) {
    errors.push('repository identity must match Project Manifest lineage.');
  }

  for (const duplicate of duplicateValues(dependencies
    .map((record) => record.analysisResultId)
    .filter((value) => value !== null))) {
    errors.push(`Duplicate dependency checklist analysis result id ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(dependencies.map((record) => record.decisionId))) {
    errors.push(`Duplicate dependency handoff decision id ${duplicate}.`);
  }

  const globalItemIds = new Set();
  for (const record of dependencies) {
    if (!isSorted(record.selectedEvidenceRefs, compareText)) {
      errors.push(`Dependency ${record.analysisResultId} selectedEvidenceRefs must be sorted.`);
    }
    if (!isSorted(record.findings, compareFindings)) {
      errors.push(`Dependency ${record.analysisResultId} findings must be sorted.`);
    }
    if (!isSorted(record.limitations, compareLimitations)) {
      errors.push(`Dependency ${record.analysisResultId} limitations must be sorted.`);
    }
    const expected = expectedDependencyState(record.analysisStatus, record.findings);
    if (record.status !== expected.status || !sameJson(record.eligibility, expected.eligibility)) {
      errors.push(`Dependency ${record.analysisResultId} status and eligibility are inconsistent.`);
    }
    if (record.analysisStatus !== 'analyzed' && record.findings.length > 0) {
      errors.push(`Not-analyzed dependency ${record.analysisResultId} cannot contain generated findings or actions.`);
    }
    for (const duplicate of duplicateValues(record.findings.map((finding) => finding.id))) {
      errors.push(`Dependency ${record.analysisResultId} has duplicate finding id ${duplicate}.`);
    }
    validateVersionSemantics(record, errors);
    validateHandoff(record, errors);
    for (const finding of record.findings) validateFinding(record, finding, globalItemIds, errors);
  }

  const expectedStatus = expectedOverallStatus(dependencies);
  if (checklist.status !== expectedStatus) {
    errors.push(`status is ${checklist.status}; expected ${expectedStatus}.`);
  }
  const expectedSummary = checklistSummary(dependencies, checklist.limitations ?? []);
  if (!sameJson(checklist.summary, expectedSummary)) errors.push('summary is inconsistent.');
  return errors.sort(compareText);
}

export function validateMigrationChecklist(checklist) {
  if (checklist?.schemaVersion !== MIGRATION_CHECKLIST_SCHEMA_VERSION) {
    throw new Error(
      `Migration Checklist validation error: unsupported schema version; expected ${MIGRATION_CHECKLIST_SCHEMA_VERSION}.`
    );
  }
  if (!validateSchema(checklist)) {
    throw new Error(
      `Migration Checklist validation error: schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`
    );
  }
  const errors = validateMigrationChecklistInvariants(checklist);
  if (errors.length > 0) {
    throw new Error(`Migration Checklist validation error: runtime invariants failed: ${errors.join(' ')}`);
  }
  return checklist;
}

export function buildMigrationChecklist({
  input,
  repository,
  dependencies = [],
  limitations = [],
  generatedAt
}) {
  if (generatedAt === undefined) {
    throw new Error('Migration Checklist input error: generatedAt is required.');
  }
  const records = structuredClone(dependencies).map(normalizeDependency).sort(compareDependencies);
  const sortedLimitations = structuredClone(limitations).sort(compareLimitations);
  const checklist = {
    schemaVersion: MIGRATION_CHECKLIST_SCHEMA_VERSION,
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
    generator: { name: ARTIFACT_GENERATOR_NAME, version: VERSION },
    input: structuredClone(input),
    repository: structuredClone(repository ?? input?.projectManifest?.repository),
    status: expectedOverallStatus(records),
    summary: checklistSummary(records, sortedLimitations),
    dependencies: records,
    limitations: sortedLimitations
  };
  return validateMigrationChecklist(checklist);
}

export function serializeMigrationChecklist(checklist) {
  validateMigrationChecklist(checklist);
  return `${JSON.stringify(checklist, null, 2)}\n`;
}
