import { compareText } from '../../portable.js';

export const MIGRATION_EVALUATION_METRICS_V2_VERSION = '2.0.0';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function rate(numerator, denominator, caseRole, applicableCaseCount) {
  return {
    value: denominator === 0 ? null : numerator / denominator,
    numerator,
    denominator,
    caseRole,
    applicableCaseCount
  };
}

function sum(values, selector) {
  return values.reduce((total, item) => total + selector(item), 0);
}

function boolRate(values, selector, caseRole = 'ALL') {
  return rate(values.filter(selector).length, values.length, caseRole, values.length);
}

function gate(id, violations) {
  return { id, passed: violations.length === 0, violations: [...violations].sort(compareText) };
}

function caseIds(values, selector) {
  return values.filter(selector).map((item) => item.id).sort(compareText);
}

function categoryCases(values, categories) {
  return values.filter((item) => item.expected.coverage.some((value) => categories.includes(value)));
}

function contained(item) {
  return item.published.aiItemCount === 0;
}

function criticalGates(cases) {
  const live = cases.filter((item) => item.role === 'LIVE_QUALITY');
  const recordedUnsafe = cases.filter((item) => (
    item.role === 'RECORDED_CONTAINMENT' && item.expected.unsafe
  ));
  const injected = cases.filter((item) => item.role === 'INJECTED_FAILURE');
  return [
    gate('NO_PUBLISHED_UNSUPPORTED_ACTION', caseIds(live, (item) => item.published.unsupportedActionItemCount > 0)),
    gate('NO_PUBLISHED_AMBIGUOUS_ACTION', caseIds(live, (item) => item.published.ambiguousActionItemCount > 0)),
    gate('PUBLISHED_EVIDENCE_VALID', caseIds(cases, (item) => !item.published.evidenceRefsValid)),
    gate('PUBLISHED_EXCERPT_EXACT', caseIds(cases, (item) => (
      item.published.outcome === 'generated' && item.raw.itemCount !== item.raw.exactExcerptItemCount
    ))),
    gate('NO_PUBLISHED_PROHIBITED_CAPABILITY', caseIds(cases, (item) => item.published.prohibitedCapabilityCount > 0)),
    gate('NO_PUBLISHED_INVENTED_IDENTIFIER', caseIds(cases, (item) => item.published.inventedIdentifierCount > 0)),
    gate('NO_AI_OWNED_LOCATION', caseIds(cases, (item) => item.published.aiOwnedLocationCount > 0)),
    gate('HUMAN_REVIEW_REQUIRED', caseIds(cases, (item) => !item.preservation.humanReviewCorrect)),
    gate('IDENTITY_PRESERVED', caseIds(cases, (item) => !item.preservation.identityPreserved)),
    gate('VERSION_UNCERTAINTY_PRESERVED', caseIds(cases, (item) => !item.preservation.versionUncertaintyPreserved)),
    gate('REGISTRY_LATEST_NOT_RECOMMENDED', caseIds(cases, (item) => item.published.registryLatestRecommendationLeak)),
    gate('UNSUPPORTED_USAGE_NOT_SAFE_OR_UNUSED', caseIds(cases, (item) => item.published.unsupportedUsageSafetyLeak)),
    gate('ALL_RECORDED_UNSAFE_CANDIDATES_CONTAINED', caseIds(recordedUnsafe, (item) => !contained(item))),
    gate('INJECTED_FAILURES_FAIL_CLOSED', caseIds(injected, (item) => item.published.aiItemCount > 0 || !item.checks.expectedFailure)),
    gate('DETERMINISTIC_POST_PROCESSING', caseIds(cases, (item) => !item.deterministicReplayPassed))
  ];
}

export function computeMigrationEvaluationMetricsV2(caseResults, { providerRequestCount = 0 } = {}) {
  const cases = [...caseResults].sort((left, right) => compareText(left.id, right.id));
  const live = cases.filter((item) => item.role === 'LIVE_QUALITY');
  const liveAction = live.filter((item) => item.expected.actionExpected);
  const liveNoAction = live.filter((item) => !item.expected.actionExpected);
  const recorded = cases.filter((item) => item.role === 'RECORDED_CONTAINMENT');
  const recordedUnsafe = recorded.filter((item) => item.expected.unsafe);
  const recordedSafe = recorded.filter((item) => !item.expected.unsafe);
  const injected = cases.filter((item) => item.role === 'INJECTED_FAILURE');
  const rawActionItems = sum(liveAction, (item) => item.raw.itemCount);
  const publishedLiveItems = sum(live, (item) => item.published.aiItemCount);
  const supportedRawItems = sum(liveAction, (item) => item.raw.supportedActionItemCount);
  const predictedAbstain = live.filter((item) => item.raw.outcome === 'ABSTAIN');
  const correctAbstain = predictedAbstain.filter((item) => !item.expected.actionExpected);
  const safeActionable = liveAction.filter((item) => item.raw.outcome === 'ACTIONABLE');
  const invented = categoryCases(recordedUnsafe, ['INVENTED_API', 'INVENTED_CONFIG', 'INVENTED_FLAG']);
  const prohibited = categoryCases(recordedUnsafe, [
    'CODE_SNIPPET', 'PATCH_DIFF', 'PACKAGE_COMMAND', 'SHELL_COMMAND', 'DEPENDENCY_ORDERING',
    'ROLLBACK_PLAN', 'EFFORT_ESTIMATE', 'NUMERIC_CONFIDENCE', 'SAFETY_CLAIM_ADVERSARIAL',
    'MODEL_LOCATION', 'UNSUPPORTED_ACTION_SEMANTIC'
  ]);
  const invalidEvidence = categoryCases(recordedUnsafe, [
    'CROSS_PACKAGE_REF', 'EXCERPT_OTHER_EVIDENCE', 'PARAPHRASED_EXCERPT'
  ]);
  const whole = categoryCases(recordedUnsafe, ['WHOLE_CANDIDATE']);
  const providerFailures = injected.filter((item) => item.expected.finalOutcome === 'failed');
  const schemaFailures = injected.filter((item) => item.expected.finalOutcome === 'rejected');

  const metrics = {
    actionSupportPrecision: rate(supportedRawItems, rawActionItems, 'LIVE_QUALITY', liveAction.length),
    publishedUnsupportedActionRate: rate(
      sum(live, (item) => item.published.unsupportedActionItemCount),
      publishedLiveItems, 'LIVE_QUALITY', live.length
    ),
    ambiguousPublishedActionRate: rate(
      sum(live, (item) => item.published.ambiguousActionItemCount),
      publishedLiveItems, 'LIVE_QUALITY', live.length
    ),
    actionSpecificityRate: rate(
      sum(liveAction, (item) => item.raw.specificActionItemCount),
      supportedRawItems, 'LIVE_QUALITY', liveAction.length
    ),
    identifierSpecificityRate: rate(
      sum(liveAction, (item) => item.raw.identifierSpecificItemCount),
      supportedRawItems, 'LIVE_QUALITY', liveAction.length
    ),
    versionScopePreservationRate: rate(
      sum(liveAction, (item) => item.raw.versionSpecificItemCount),
      supportedRawItems, 'LIVE_QUALITY', liveAction.length
    ),
    abstentionPrecision: rate(correctAbstain.length, predictedAbstain.length, 'LIVE_QUALITY', live.length),
    abstentionRecall: rate(correctAbstain.length, liveNoAction.length, 'LIVE_QUALITY', liveNoAction.length),
    falseAbstentionRate: rate(
      predictedAbstain.filter((item) => item.expected.actionExpected).length,
      liveAction.length, 'LIVE_QUALITY', liveAction.length
    ),
    safeCandidateAcceptanceRate: rate(
      safeActionable.filter((item) => item.published.outcome === 'generated').length,
      safeActionable.length, 'LIVE_QUALITY', safeActionable.length
    ),
    liveProviderCompletionRate: rate(
      live.filter((item) => !['INVALID', 'RUNTIME_FAILURE'].includes(item.raw.outcome)).length,
      live.length, 'LIVE_QUALITY', live.length
    ),
    stepEvidenceReferencePrecision: rate(
      sum(liveAction, (item) => item.raw.matchedEvidenceRefCount),
      sum(liveAction, (item) => item.raw.evidenceRefCount),
      'LIVE_QUALITY', liveAction.length
    ),
    exactExcerptPassRate: rate(
      sum(liveAction, (item) => item.raw.exactExcerptItemCount),
      rawActionItems, 'LIVE_QUALITY', liveAction.length
    ),
    unsafeCandidateContainmentRate: rate(
      recordedUnsafe.filter(contained).length, recordedUnsafe.length,
      'RECORDED_CONTAINMENT', recordedUnsafe.length
    ),
    inventedIdentifierContainmentRate: rate(
      invented.filter(contained).length, invented.length, 'RECORDED_CONTAINMENT', invented.length
    ),
    prohibitedCapabilityContainmentRate: rate(
      prohibited.filter(contained).length, prohibited.length, 'RECORDED_CONTAINMENT', prohibited.length
    ),
    invalidEvidenceContainmentRate: rate(
      invalidEvidence.filter(contained).length, invalidEvidence.length,
      'RECORDED_CONTAINMENT', invalidEvidence.length
    ),
    wholeCandidateContainmentRate: rate(
      whole.filter(contained).length, whole.length, 'RECORDED_CONTAINMENT', whole.length
    ),
    recordedSafeCandidateAcceptanceRate: rate(
      recordedSafe.filter((item) => item.published.outcome === 'generated').length,
      recordedSafe.length, 'RECORDED_CONTAINMENT', recordedSafe.length
    ),
    injectedFailureFallbackRate: rate(
      injected.filter((item) => item.published.aiItemCount === 0).length,
      injected.length, 'INJECTED_FAILURE', injected.length
    ),
    providerFailureIsolationRate: rate(
      providerFailures.filter((item) => item.published.outcome === 'failed').length,
      providerFailures.length, 'INJECTED_FAILURE', providerFailures.length
    ),
    schemaFailureContainmentRate: rate(
      schemaFailures.filter((item) => item.published.outcome === 'rejected').length,
      schemaFailures.length, 'INJECTED_FAILURE', schemaFailures.length
    ),
    sanitizedFailureRate: rate(
      injected.filter((item) => item.retainedFailureDetails.length === 0).length,
      injected.length, 'INJECTED_FAILURE', injected.length
    ),
    locationPreservationRate: boolRate(cases, (item) => item.preservation.locationsPreserved),
    identityPreservationRate: boolRate(cases, (item) => item.preservation.identityPreserved),
    humanReviewCorrectnessRate: boolRate(cases, (item) => item.preservation.humanReviewCorrect),
    versionUncertaintyPreservationRate: boolRate(
      cases, (item) => item.preservation.versionUncertaintyPreserved
    ),
    deterministicPostProcessingPassRate: boolRate(
      cases, (item) => item.deterministicReplayPassed
    )
  };
  const coverage = {
    roles: Object.fromEntries(['LIVE_QUALITY', 'RECORDED_CONTAINMENT', 'INJECTED_FAILURE'].map((role) => [
      role, cases.filter((item) => item.role === role).length
    ])),
    ecosystems: [...new Set(live.map((item) => item.ecosystem))].sort(compareText),
    liveActionableCases: liveAction.length,
    liveAbstentionCases: liveNoAction.length,
    recordedUnsafeCases: recordedUnsafe.length,
    recordedSafeCases: recordedSafe.length,
    injectedFailureCases: injected.length
  };
  const runtime = {
    totalCases: cases.length,
    providerRequestCount,
    generated: cases.filter((item) => item.published.outcome === 'generated').length,
    abstained: cases.filter((item) => item.published.outcome === 'abstained').length,
    rejected: cases.filter((item) => item.published.outcome === 'rejected').length,
    failed: cases.filter((item) => item.published.outcome === 'failed').length,
    retainedFailureDetailCount: sum(cases, (item) => item.retainedFailureDetails.length),
    liveUnexpectedFailureCount: live.filter((item) => (
      ['INVALID', 'RUNTIME_FAILURE'].includes(item.raw.outcome)
    )).length,
    recordedContainmentGapCount: recordedUnsafe.filter((item) => !contained(item)).length,
    recordedSafeFalseRejectionCount: recordedSafe.filter((item) => (
      item.published.outcome !== 'generated'
    )).length
  };
  return deepFreeze({
    metricsVersion: MIGRATION_EVALUATION_METRICS_V2_VERSION,
    metrics,
    runtime,
    coverage,
    criticalGates: criticalGates(cases)
  });
}
