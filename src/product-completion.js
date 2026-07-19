import { compareText } from './portable.js';

export const PRODUCT_COMPLETION_SCHEMA_VERSION = '1.0.0';
export const PRODUCT_COMPLETION_STATUSES = Object.freeze([
  'COMPLETED',
  'COMPLETED_WITH_REVIEW',
  'PARTIAL',
  'INSUFFICIENT_DATA',
  'FAILED',
  'CANCELLED'
]);

const HANDOFF_STATUSES = Object.freeze([
  'NO_VERSION_CHANGE_REQUIRED',
  'ACTIONABLE_WITH_REVIEW',
  'INVESTIGATION_REQUIRED',
  'INSUFFICIENT_EVIDENCE',
  'NOT_ANALYZED',
  'ACTION_GENERATION_FAILED',
  'NO_GROUNDED_ACTION'
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function handoffByDecision(migrationChecklistViewModel) {
  return new Map((migrationChecklistViewModel?.dependencies ?? []).map((dependency) => [
    dependency.decisionId,
    dependency
  ]));
}

function analysisById(versionAnalysis) {
  return new Map((versionAnalysis?.results ?? []).map((result) => [result.id, result]));
}

function failureCodes(record, analysis) {
  return [...new Set([
    ...record.reasonCodes,
    ...(analysis?.humanReviewReasons ?? []),
    ...(analysis?.limitations ?? []).map((item) => item.code)
  ])].sort(compareText);
}

function failureRecovery(codes) {
  if (codes.includes('INSUFFICIENT_CREDIT')) {
    return 'Add credit or change the configured provider, then rerun the failed dependency analysis.';
  }
  if (codes.some((code) => code.includes('RATE_LIMIT'))) {
    return 'Wait for the configured provider rate limit to clear, then rerun the failed dependency analysis.';
  }
  if (codes.some((code) => /OUTPUT|SCHEMA|REJECT/.test(code))) {
    return 'The provider output was rejected and was not published; review or rerun the failed dependency analysis.';
  }
  if (codes.some((code) => /TIMEOUT|PROVIDER|RUNTIME/.test(code))) {
    return 'Resolve the configured provider/runtime failure, then rerun the failed dependency analysis.';
  }
  return 'Review the failed Version Analysis occurrence and rerun it after resolving the recorded limitation.';
}

function nextStepFor(record, handoff) {
  if (handoff?.nextStep?.message) return handoff.nextStep.message;
  if (record.decision === 'KEEP_CURRENT') return 'No version change is required for this target.';
  if (record.decision === 'PLAN_UPGRADE' || record.decision === 'UPGRADE_NOW') {
    return 'Review the evidence-bounded migration handoff before changing source or dependency declarations.';
  }
  if (record.decision === 'INVESTIGATE') {
    if (record.primaryReasonCode === 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER') {
      return 'A newer version is available, but no upgrade target has been selected; use --target to select one.';
    }
    return 'Complete the stated human investigation before selecting migration work.';
  }
  if (record.primaryReasonCode === 'INSTALLED_VERSION_UNAVAILABLE') {
    return 'Resolve the installed version baseline and rerun analysis.';
  }
  if (record.primaryReasonCode === 'TARGET_VERSION_UNAVAILABLE') {
    return 'Refresh research when external verification is available or select a validated explicit target.';
  }
  if (record.decision === 'INSUFFICIENT_EVIDENCE') {
    return 'Collect valid target-scoped evidence and rerun analysis.';
  }
  if (record.primaryReasonCode === 'VERSION_ANALYSIS_SKIPPED') {
    return 'Resolve the missing baseline, target, or evidence and rerun Version Analysis.';
  }
  return 'Resolve the failed Version Analysis occurrence and rerun it.';
}

function coverageLabel(record) {
  const coverage = record.impact.coverage.status;
  const values = {
    complete: record.impact.status === 'IMPACTED' ? 'Impacted; complete coverage' : 'Complete coverage',
    partial: 'Partial coverage',
    unavailable: 'Coverage unavailable',
    failed: 'Coverage failed',
    missing: 'Coverage unavailable'
  };
  return values[coverage] ?? 'Coverage unknown';
}

function compareDecisions(left, right) {
  return compareText(left.projectId, right.projectId)
    || compareText(left.manifest, right.manifest)
    || compareText(left.packageId, right.packageId)
    || compareText(left.dependencyType, right.dependencyType)
    || compareText(left.id, right.id);
}

function overallNextStep(status, decisions) {
  if (status === 'PARTIAL') {
    return 'Resolve the listed provider/output/runtime failures and rerun the failed occurrences.';
  }
  if (status === 'INSUFFICIENT_DATA') {
    return 'Resolve missing installed baselines or target-scoped evidence, then rerun analysis.';
  }
  if (status === 'COMPLETED_WITH_REVIEW') {
    if (decisions.some((item) => item.handoffStatus === 'ACTIONABLE_WITH_REVIEW')) {
      return 'Review and approve the evidence-bounded migration handoff before source changes.';
    }
    if (decisions.some((item) => (
      item.decision === 'INVESTIGATE'
      && item.nextStep.includes('--target')
    ))) {
      return 'Review investigation results; use --target for any dependency you choose to plan.';
    }
    return 'Review the listed dependency decisions and coverage limitations.';
  }
  return 'No additional version change is required for the evaluated targets.';
}

export function buildProductCompletion({
  upgradeDecision,
  versionAnalysis = null,
  migrationChecklistViewModel = null,
  artifactPaths = {}
}) {
  if (!upgradeDecision?.summary || !Array.isArray(upgradeDecision.decisions)) {
    throw new Error('Product completion requires a persisted Upgrade Decision artifact.');
  }
  const handoffs = handoffByDecision(migrationChecklistViewModel);
  const analyses = analysisById(versionAnalysis);
  const decisions = upgradeDecision.decisions.map((record) => {
    const handoff = handoffs.get(record.id) ?? null;
    return {
      id: record.id,
      analysisResultId: record.analysisResultId,
      projectId: record.occurrence.projectId,
      manifest: record.occurrence.manifest,
      dependencyType: record.occurrence.dependencyType,
      packageId: record.occurrence.packageId,
      dependency: record.occurrence.declaredName,
      installedVersion: record.versions.installedVersion,
      targetVersion: record.versions.targetVersion,
      targetOrigin: record.versions.targetPolicy,
      decision: record.decision,
      explanation: record.summary,
      coverage: coverageLabel(record),
      handoffStatus: handoff?.handoffStatus ?? null,
      nextStep: nextStepFor(record, handoff),
      requiresHumanReview: record.requiresHumanReview
    };
  }).sort(compareDecisions);
  const failedOccurrences = upgradeDecision.decisions.flatMap((record) => {
    const handoff = handoffs.get(record.id);
    const versionFailed = record.reasonCodes.includes('VERSION_ANALYSIS_FAILED');
    const actionFailed = handoff?.handoffStatus === 'ACTION_GENERATION_FAILED';
    if (!versionFailed && !actionFailed) return [];
    const analysis = analyses.get(record.analysisResultId);
    const codes = failureCodes(record, analysis);
    return [{
      decisionId: record.id,
      projectId: record.occurrence.projectId,
      manifest: record.occurrence.manifest,
      dependencyType: record.occurrence.dependencyType,
      packageId: record.occurrence.packageId,
      dependency: record.occurrence.declaredName,
      stage: actionFailed ? 'Migration Checklist' : 'Version Analysis',
      failureType: actionFailed ? 'ACTION_GENERATION_FAILED' : 'VERSION_ANALYSIS_FAILED',
      recovery: actionFailed
        ? 'Review the rejected or failed migration action manually, then rerun Migration Checklist.'
        : failureRecovery(codes)
    }];
  }).sort(compareDecisions);
  const explicitInsufficient = upgradeDecision.decisions.some((record) => (
    record.versions.targetPolicy === 'explicit'
    && record.decision === 'INSUFFICIENT_EVIDENCE'
  ));
  const unansweredCount = upgradeDecision.decisions.filter((record) => (
    record.decision === 'INSUFFICIENT_EVIDENCE'
    || (record.decision === 'NOT_ANALYZED'
      && !record.reasonCodes.includes('VERSION_ANALYSIS_FAILED'))
  )).length;
  const majorityUnanswered = upgradeDecision.decisions.length > 0
    && unansweredCount * 2 > upgradeDecision.decisions.length;
  const hasReview = upgradeDecision.decisions.some((record) => (
    record.requiresHumanReview
    || ['PLAN_UPGRADE', 'UPGRADE_NOW', 'INVESTIGATE'].includes(record.decision)
    || record.impact.coverage.status !== 'complete'
  ));
  const actionGenerationFailed = [...handoffs.values()].some((handoff) => (
    handoff.handoffStatus === 'ACTION_GENERATION_FAILED'
  ));
  const status = failedOccurrences.length > 0 || actionGenerationFailed
    ? 'PARTIAL'
    : explicitInsufficient || majorityUnanswered
      ? 'INSUFFICIENT_DATA'
      : hasReview
        ? 'COMPLETED_WITH_REVIEW'
        : 'COMPLETED';
  const handoffCounts = Object.fromEntries(HANDOFF_STATUSES.map((value) => [
    value,
    migrationChecklistViewModel?.summary?.handoffStatusCounts?.[value] ?? 0
  ]));
  const output = {
    schemaVersion: PRODUCT_COMPLETION_SCHEMA_VERSION,
    status,
    nextStep: overallNextStep(status, decisions),
    decisionCounts: {
      KEEP_CURRENT: upgradeDecision.summary.KEEP_CURRENT,
      UPGRADE_NOW: upgradeDecision.summary.UPGRADE_NOW,
      PLAN_UPGRADE: upgradeDecision.summary.PLAN_UPGRADE,
      INVESTIGATE: upgradeDecision.summary.INVESTIGATE,
      INSUFFICIENT_EVIDENCE: upgradeDecision.summary.INSUFFICIENT_EVIDENCE,
      NOT_ANALYZED: upgradeDecision.summary.NOT_ANALYZED
    },
    handoffCounts,
    reviewRequiredCount: upgradeDecision.summary.requiresHumanReviewCount,
    failedOccurrences,
    decisions,
    artifactPaths: {
      report: artifactPaths.report ?? null,
      upgradeDecision: artifactPaths.upgradeDecision ?? null,
      migrationChecklist: artifactPaths.migrationChecklist ?? null
    }
  };
  return deepFreeze(output);
}

export function productCompletionExitCode(completion, { strict = false } = {}) {
  if (completion.status === 'FAILED') return 1;
  if (completion.status === 'CANCELLED') return 130;
  if (completion.status === 'PARTIAL') return 2;
  if (strict && ['COMPLETED_WITH_REVIEW', 'INSUFFICIENT_DATA'].includes(completion.status)) {
    return 2;
  }
  return 0;
}
