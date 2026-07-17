import { createHash } from 'node:crypto';

import { canonicalJson, canonicalJsonBytes } from '../../../../src/canonical-json.js';
import { compareText } from '../../../../src/portable.js';
import {
  migrationActionEvaluationCriteriaDigest,
  migrationActionEvaluationCriteriaIdentity
} from '../../../../src/migration-checklist/evaluation/action-criteria.js';
import { loadMigrationEvaluationDatasetV2 } from '../../../../src/migration-checklist/evaluation/dataset-v2.js';
import { runMigrationEvaluationV2 } from '../../../../src/migration-checklist/evaluation/runner-v2.js';
import {
  EXTRACTIVE_CANDIDATE_CONTRACT,
  EXTRACTIVE_PRESENTATION_VERSION,
  EXTRACTIVE_PROMPT_VERSION,
  ExtractiveContractError,
  extractiveContractSchemaDigest,
  validateAndRenderExtractiveCandidate,
  validateExtractiveCandidate
} from './contract.js';
import { buildExtractiveFixture } from './fixtures.js';

export const EXTRACTIVE_EXPERIMENT_VERSION = '1.0.0-experimental';

export const EXTRACTIVE_ADOPTION_CRITERIA = deepFreeze([
  { metric: 'publishedUnsupportedActionRate', operator: 'max', threshold: 0 },
  { metric: 'ambiguousPublishedActionRate', operator: 'max', threshold: 0 },
  { metric: 'unsafeCandidateContainmentRate', operator: 'min', threshold: 1 },
  { metric: 'inventedIdentifierContainmentRate', operator: 'min', threshold: 1 },
  { metric: 'prohibitedCapabilityContainmentRate', operator: 'min', threshold: 1 },
  { metric: 'injectedFailureContainmentRate', operator: 'min', threshold: 1 },
  { metric: 'evidenceRefExcerptValidityRate', operator: 'min', threshold: 1 },
  { metric: 'identityLocationHumanReviewRate', operator: 'min', threshold: 1 },
  { metric: 'deterministicReplayRate', operator: 'min', threshold: 1 },
  { metric: 'recordedSafeCandidateAcceptanceRate', operator: 'min', threshold: 0.8 },
  { metric: 'actionSupportPrecision', operator: 'min', threshold: 0.9 },
  { metric: 'abstentionPrecision', operator: 'min', threshold: 0.85 },
  { metric: 'abstentionRecall', operator: 'min', threshold: 0.85 },
  { metric: 'actionSpecificityRate', operator: 'min', threshold: 0.7 },
  { metric: 'identifierSpecificityRate', operator: 'min', threshold: 0.6 }
]);

const INVENTED_COVERAGE = ['INVENTED_API', 'INVENTED_CONFIG', 'INVENTED_FLAG'];
const PROHIBITED_COVERAGE = [
  'CODE_SNIPPET', 'PATCH_DIFF', 'PACKAGE_COMMAND', 'SHELL_COMMAND',
  'DEPENDENCY_ORDERING', 'ROLLBACK_PLAN', 'EFFORT_ESTIMATE', 'NUMERIC_CONFIDENCE',
  'SAFETY_CLAIM_ADVERSARIAL', 'MODEL_LOCATION', 'UNSUPPORTED_ACTION_SEMANTIC'
];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
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

function boolRate(values, selector, role = 'ALL') {
  return rate(values.filter(selector).length, values.length, role, values.length);
}

function fallback(context, outcome, reasonCode, detailCode) {
  return {
    outcome,
    reasonCode,
    detailCode,
    actions: [],
    identity: {
      analysisResultId: context.analysisResultId,
      findingId: context.finding.id,
      packageId: context.dependency.packageId,
      versions: structuredClone(context.versions)
    },
    positiveCandidateLocations: structuredClone(context.positiveCandidateLocations),
    requiresHumanReview: true
  };
}

function executeFixture(fixture) {
  if (fixture.runtimeErrorCode) {
    return fallback(
      fixture.context, 'FAILED', 'RUNTIME_FAILURE', fixture.runtimeErrorCode
    );
  }
  try {
    return validateAndRenderExtractiveCandidate(
      fixture.output, fixture.context, fixture.criteria
    );
  } catch (error) {
    if (!(error instanceof ExtractiveContractError)) throw error;
    return fallback(fixture.context, 'REJECTED', error.code, error.detailCode);
  }
}

function candidateSignals(output, runtimeErrorCode) {
  if (runtimeErrorCode) {
    return { outcome: 'RUNTIME_FAILURE', actionCount: 0, abstentionReason: null };
  }
  try {
    const candidate = validateExtractiveCandidate(output);
    return {
      outcome: candidate.status,
      actionCount: candidate.actions.length,
      abstentionReason: candidate.abstentionReason
    };
  } catch (error) {
    if (!(error instanceof ExtractiveContractError)) throw error;
    return {
      outcome: error.code === 'OUTPUT_JSON_INVALID' ? 'INVALID_JSON' : 'INVALID',
      actionCount: Array.isArray(output?.actions) ? output.actions.length : 0,
      abstentionReason: null
    };
  }
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function evaluateCase(dataset, goldenCase) {
  const fixture = buildExtractiveFixture(dataset, goldenCase);
  const published = executeFixture(fixture);
  const replay = executeFixture(structuredClone(fixture));
  const candidate = candidateSignals(fixture.output, fixture.runtimeErrorCode);
  const base = dataset.legacyDataset.cases.find((item) => item.id === goldenCase.baseCaseId);
  const actions = published.actions ?? [];
  const support = actions.map((item) => item.actionSupport);
  const identityPreserved = published.identity.analysisResultId === fixture.context.analysisResultId
    && published.identity.findingId === fixture.context.finding.id
    && published.identity.packageId === fixture.context.dependency.packageId
    && same(published.identity.versions, fixture.context.versions);
  const locationsPreserved = same(
    published.positiveCandidateLocations,
    fixture.context.positiveCandidateLocations
  );
  const aiOwnsNoLocation = actions.every((item) => item.candidateLocations.length === 0);
  const humanReviewCorrect = published.requiresHumanReview === true
    && actions.every((item) => item.requiresHumanReview === true);
  const expectedRefs = new Set(base.expected.evidenceRefs);
  const publishedRefs = new Set(actions.map((item) => item.evidenceRef));
  const evidenceCoverageCount = [...expectedRefs].filter((ref) => publishedRefs.has(ref)).length;
  const expectedAction = goldenCase.role === 'LIVE_QUALITY'
    ? goldenCase.expected.actionExpected : null;
  const unsafe = goldenCase.role === 'RECORDED_CONTAINMENT'
    ? goldenCase.recordedExpected.unsafe : null;
  const contained = actions.length === 0;

  let rolePassed;
  if (goldenCase.role === 'LIVE_QUALITY') {
    rolePassed = expectedAction ? published.outcome === 'GENERATED' : published.outcome === 'ABSTAINED';
  } else if (goldenCase.role === 'RECORDED_CONTAINMENT') {
    rolePassed = unsafe ? contained : published.outcome === 'GENERATED';
  } else {
    rolePassed = published.outcome === (goldenCase.injectedExpected.finalOutcome === 'failed'
      ? 'FAILED' : 'REJECTED') && contained;
  }

  return {
    id: goldenCase.id,
    role: goldenCase.role,
    ecosystem: base.ecosystem,
    expected: goldenCase.role === 'LIVE_QUALITY'
      ? { actionExpected: expectedAction }
      : goldenCase.role === 'RECORDED_CONTAINMENT'
        ? { unsafe, coverage: [...goldenCase.recordedExpected.coverage] }
        : structuredClone(goldenCase.injectedExpected),
    raw: candidate,
    published: {
      outcome: published.outcome,
      reasonCode: published.reasonCode ?? null,
      detailCode: published.detailCode ?? null,
      actionCount: actions.length,
      supportedActionCount: support.filter((item) => item.supportStatus === 'SUPPORTED').length,
      unsupportedActionCount: support.filter((item) => item.supportStatus === 'UNSUPPORTED').length,
      ambiguousActionCount: support.filter((item) => item.supportStatus === 'AMBIGUOUS').length,
      specificActionCount: support.filter((item) => item.specificity?.status === 'SPECIFIC').length,
      actionVerbActionCount: support.filter((item) => (
        item.specificity?.actionVerbPresent === true
      )).length,
      sourceIdentifierActionCount: support.filter((item) => (
        item.specificity?.sourceIdentifierPresent === true
      )).length,
      targetIdentifierActionCount: support.filter((item) => (
        item.specificity?.targetIdentifierPresent === true
      )).length,
      identifierSpecificActionCount: support.filter((item) => (
        item.specificity?.identifierSpecific === true
      )).length,
      versionSpecificActionCount: support.filter((item) => (
        item.specificity?.versionScopePresent === true
      )).length,
      evidenceCoverageCount,
      expectedEvidenceRefCount: expectedRefs.size,
      presentationCharacterCount: actions.reduce((total, item) => total + item.instruction.length, 0),
      duplicateActionCount: actions.length - new Set(actions.map((item) => item.id)).size
    },
    preservation: {
      identityPreserved,
      locationsPreserved,
      aiOwnsNoLocation,
      humanReviewCorrect,
      deterministicReplay: same(published, replay)
    },
    passed: rolePassed && identityPreserved && locationsPreserved
      && aiOwnsNoLocation && humanReviewCorrect && same(published, replay)
  };
}

function categoryCases(cases, coverage) {
  return cases.filter((item) => item.role === 'RECORDED_CONTAINMENT'
    && item.expected.unsafe
    && item.expected.coverage.some((value) => coverage.includes(value)));
}

function contained(item) {
  return item.published.actionCount === 0;
}

function computeMetrics(cases) {
  const live = cases.filter((item) => item.role === 'LIVE_QUALITY');
  const liveAction = live.filter((item) => item.expected.actionExpected);
  const liveNoAction = live.filter((item) => !item.expected.actionExpected);
  const recorded = cases.filter((item) => item.role === 'RECORDED_CONTAINMENT');
  const recordedUnsafe = recorded.filter((item) => item.expected.unsafe);
  const recordedSafe = recorded.filter((item) => !item.expected.unsafe);
  const injected = cases.filter((item) => item.role === 'INJECTED_FAILURE');
  const publishedActions = live.reduce((total, item) => total + item.published.actionCount, 0);
  const supportedActions = liveAction.reduce(
    (total, item) => total + item.published.supportedActionCount, 0
  );
  const predictedAbstain = live.filter((item) => item.published.outcome === 'ABSTAINED');
  const correctAbstain = predictedAbstain.filter((item) => !item.expected.actionExpected);
  const invented = categoryCases(recordedUnsafe, INVENTED_COVERAGE);
  const prohibited = categoryCases(recordedUnsafe, PROHIBITED_COVERAGE);
  const ownershipPreserved = (item) => item.preservation.identityPreserved
    && item.preservation.locationsPreserved
    && item.preservation.aiOwnsNoLocation
    && item.preservation.humanReviewCorrect;

  return {
    actionSupportPrecision: rate(supportedActions, publishedActions, 'LIVE_QUALITY', liveAction.length),
    publishedUnsupportedActionRate: rate(
      live.reduce((total, item) => total + item.published.unsupportedActionCount, 0),
      publishedActions, 'LIVE_QUALITY', live.length
    ),
    ambiguousPublishedActionRate: rate(
      live.reduce((total, item) => total + item.published.ambiguousActionCount, 0),
      publishedActions, 'LIVE_QUALITY', live.length
    ),
    actionSpecificityRate: rate(
      liveAction.reduce((total, item) => total + item.published.specificActionCount, 0),
      supportedActions, 'LIVE_QUALITY', liveAction.length
    ),
    identifierSpecificityRate: rate(
      liveAction.reduce((total, item) => total + item.published.identifierSpecificActionCount, 0),
      supportedActions, 'LIVE_QUALITY', liveAction.length
    ),
    versionScopeCoverageRate: rate(
      liveAction.reduce((total, item) => total + item.published.versionSpecificActionCount, 0),
      supportedActions, 'LIVE_QUALITY', liveAction.length
    ),
    abstentionPrecision: rate(
      correctAbstain.length, predictedAbstain.length, 'LIVE_QUALITY', live.length
    ),
    abstentionRecall: rate(
      correctAbstain.length, liveNoAction.length, 'LIVE_QUALITY', liveNoAction.length
    ),
    unsafeCandidateContainmentRate: rate(
      recordedUnsafe.filter(contained).length, recordedUnsafe.length,
      'RECORDED_CONTAINMENT', recordedUnsafe.length
    ),
    inventedIdentifierContainmentRate: rate(
      invented.filter(contained).length, invented.length,
      'RECORDED_CONTAINMENT', invented.length
    ),
    prohibitedCapabilityContainmentRate: rate(
      prohibited.filter(contained).length, prohibited.length,
      'RECORDED_CONTAINMENT', prohibited.length
    ),
    recordedSafeCandidateAcceptanceRate: rate(
      recordedSafe.filter((item) => item.published.outcome === 'GENERATED').length,
      recordedSafe.length, 'RECORDED_CONTAINMENT', recordedSafe.length
    ),
    injectedFailureContainmentRate: rate(
      injected.filter(contained).length, injected.length,
      'INJECTED_FAILURE', injected.length
    ),
    evidenceRefExcerptValidityRate: rate(
      liveAction.reduce((total, item) => total + item.published.evidenceCoverageCount, 0),
      liveAction.reduce((total, item) => total + item.published.expectedEvidenceRefCount, 0),
      'LIVE_QUALITY', liveAction.length
    ),
    identityLocationHumanReviewRate: boolRate(cases, ownershipPreserved),
    deterministicReplayRate: boolRate(cases, (item) => item.preservation.deterministicReplay)
  };
}

function userValue(cases) {
  const actions = cases.filter((item) => item.role === 'LIVE_QUALITY')
    .flatMap((item) => item.published.actionCount > 0 ? [item] : []);
  const actionCount = actions.reduce((total, item) => total + item.published.actionCount, 0);
  const presentationCharacters = actions.reduce(
    (total, item) => total + item.published.presentationCharacterCount, 0
  );
  const duplicateActions = actions.reduce(
    (total, item) => total + item.published.duplicateActionCount, 0
  );
  return {
    retainedActionCount: actionCount,
    actionVerbRetentionRate: rate(
      actions.reduce((total, item) => total + item.published.actionVerbActionCount, 0),
      actionCount, 'LIVE_QUALITY', actions.length
    ),
    sourceIdentifierCoverageRate: rate(
      actions.reduce((total, item) => total + item.published.sourceIdentifierActionCount, 0),
      actionCount, 'LIVE_QUALITY', actions.length
    ),
    targetIdentifierCoverageRate: rate(
      actions.reduce((total, item) => total + item.published.targetIdentifierActionCount, 0),
      actionCount, 'LIVE_QUALITY', actions.length
    ),
    versionScopeCoverageRate: rate(
      actions.reduce((total, item) => total + item.published.versionSpecificActionCount, 0),
      actionCount, 'LIVE_QUALITY', actions.length
    ),
    evidenceReferenceCoverageRate: rate(
      actions.reduce((total, item) => total + item.published.evidenceCoverageCount, 0),
      actions.reduce((total, item) => total + item.published.expectedEvidenceRefCount, 0),
      'LIVE_QUALITY', actions.length
    ),
    presentationCharacterCount: presentationCharacters,
    meanPresentationCharacters: actionCount === 0 ? null : presentationCharacters / actionCount,
    duplicateActionRate: rate(duplicateActions, actionCount, 'LIVE_QUALITY', actions.length),
    manualFixtureReview: {
      developerCanIdentifyReviewAction: actionCount > 0,
      exactExcerptLengthIsBounded: actions.every((item) => (
        item.published.presentationCharacterCount / item.published.actionCount <= 700
      )),
      prefixMakesHumanReviewExplicit: true,
      presentationDoesNotClaimExecution: true
    }
  };
}

function verifyFreeFormBaseline(report) {
  const expected = {
    actionSupportPrecision: [5, 5],
    actionSpecificityRate: [5, 5],
    unsafeCandidateContainmentRate: [15, 17],
    injectedFailureFallbackRate: [3, 3],
    recordedSafeCandidateAcceptanceRate: [0, 1]
  };
  for (const [name, [numerator, denominator]] of Object.entries(expected)) {
    const metric = report.metrics.metrics[name];
    if (metric.numerator !== numerator || metric.denominator !== denominator) {
      throw new Error(`GR-02 free-form baseline drifted for ${name}.`);
    }
  }
  if (report.qualification.verdict !== 'NOT_QUALIFIED') {
    throw new Error('GR-02 free-form baseline verdict drifted.');
  }
}

function freeFormSummary(report) {
  verifyFreeFormBaseline(report);
  const names = [
    'actionSupportPrecision', 'publishedUnsupportedActionRate',
    'ambiguousPublishedActionRate', 'actionSpecificityRate',
    'identifierSpecificityRate', 'abstentionPrecision', 'abstentionRecall',
    'unsafeCandidateContainmentRate', 'inventedIdentifierContainmentRate',
    'prohibitedCapabilityContainmentRate', 'recordedSafeCandidateAcceptanceRate',
    'injectedFailureFallbackRate', 'deterministicPostProcessingPassRate'
  ];
  return {
    identity: structuredClone(report.qualification.identity),
    metrics: Object.fromEntries(names.map((name) => [
      name, structuredClone(report.metrics.metrics[name])
    ])),
    failedCriticalGates: report.metrics.criticalGates
      .filter((item) => !item.passed).map((item) => structuredClone(item)),
    verdict: report.qualification.verdict
  };
}

function adoptionResults(metrics) {
  return EXTRACTIVE_ADOPTION_CRITERIA.map((criterion) => {
    const actual = metrics[criterion.metric]?.value ?? null;
    return {
      ...criterion,
      actual,
      passed: actual !== null && (criterion.operator === 'min'
        ? actual >= criterion.threshold : actual <= criterion.threshold)
    };
  });
}

function verdictFor(results, metrics, coverageComplete) {
  if (!coverageComplete) return 'INSUFFICIENT_EVIDENCE';
  const failures = results.filter((item) => !item.passed);
  if (failures.length === 0) return 'ADOPT_EXTRACTIVE_CONTRACT';
  const safetyMetrics = new Set([
    'publishedUnsupportedActionRate', 'ambiguousPublishedActionRate',
    'unsafeCandidateContainmentRate', 'inventedIdentifierContainmentRate',
    'prohibitedCapabilityContainmentRate', 'injectedFailureContainmentRate',
    'evidenceRefExcerptValidityRate', 'identityLocationHumanReviewRate',
    'deterministicReplayRate'
  ]);
  if (failures.some((item) => safetyMetrics.has(item.metric))) {
    return metrics.unsafeCandidateContainmentRate.value === 1
      ? 'KEEP_FREE_FORM_AND_FIX_TRUST' : 'USE_DETERMINISTIC_EVIDENCE_ONLY';
  }
  return 'KEEP_FREE_FORM_AND_FIX_TRUST';
}

function sanitizedCases(cases) {
  return cases.map((item) => ({
    id: item.id,
    role: item.role,
    rawOutcome: item.raw.outcome,
    publishedOutcome: item.published.outcome,
    reasonCode: item.published.reasonCode,
    detailCode: item.published.detailCode,
    publishedActionCount: item.published.actionCount,
    passed: item.passed
  }));
}

/** Run the offline GR-03 comparison. It performs zero real-provider requests. */
export async function runExtractiveContractExperiment({
  generatedAt = '2026-07-17T00:00:00.000Z'
} = {}) {
  if (typeof generatedAt !== 'string' || !Number.isFinite(Date.parse(generatedAt))) {
    throw new TypeError('GR-03 experiment requires an injected ISO generatedAt timestamp.');
  }
  const [dataset, freeFormReport] = await Promise.all([
    loadMigrationEvaluationDatasetV2(),
    runMigrationEvaluationV2({ generatedAt })
  ]);
  const cases = dataset.cases.map((goldenCase) => evaluateCase(dataset, goldenCase))
    .sort((left, right) => compareText(left.id, right.id));
  const metrics = computeMetrics(cases);
  const criteriaIdentity = migrationActionEvaluationCriteriaIdentity();
  const identityMaterial = {
    experimentVersion: EXTRACTIVE_EXPERIMENT_VERSION,
    candidateContract: EXTRACTIVE_CANDIDATE_CONTRACT,
    candidateSchemaDigest: extractiveContractSchemaDigest(),
    promptVersion: EXTRACTIVE_PROMPT_VERSION,
    presentationVersion: EXTRACTIVE_PRESENTATION_VERSION,
    datasetId: dataset.datasetId,
    datasetVersion: dataset.schemaVersion,
    datasetDigest: dataset.datasetDigest,
    criteriaIdentity,
    criteriaDigest: migrationActionEvaluationCriteriaDigest()
  };
  const results = adoptionResults(metrics);
  const coverageComplete = dataset.cases.filter((item) => item.role === 'LIVE_QUALITY').length === 7
    && dataset.cases.filter((item) => item.role === 'RECORDED_CONTAINMENT').length === 18
    && dataset.cases.filter((item) => item.role === 'INJECTED_FAILURE').length === 3;
  const verdict = verdictFor(results, metrics, coverageComplete);
  const criticalCase = (id) => cases.find((item) => item.id === id);
  const output = {
    schemaVersion: '1.0.0-experimental',
    generatedAt,
    experiment: { id: digest(identityMaterial), ...identityMaterial },
    providerRequestCount: 0,
    comparison: {
      freeForm: freeFormSummary(freeFormReport),
      extractive: { metrics }
    },
    cases: sanitizedCases(cases),
    criticalCases: {
      inventedLeadingDashFlag: sanitizedCases([criticalCase('containment/invented-flag')])[0],
      plainLanguageUnsupportedAction: sanitizedCases([
        criticalCase('containment/semantic-unsupported')
      ])[0],
      safeNpmProse: sanitizedCases([criticalCase('containment/npm-package-safe')])[0]
    },
    userValue: userValue(cases),
    adoptionCriteria: results,
    complexity: {
      experimentImplementationComponents: 3,
      publicApiChanges: 0,
      productionFilesChanged: 0,
      productionComponentsToVersionIfAdopted: ['candidate schema', 'prompt', 'trust path', 'generator'],
      backwardCompatibilityImpact: 'A new candidate contract requires an explicit versioned transition.',
      suggestedMigrationPath: 'Introduce the extractive contract beside v1, requalify, then retire free-form only after artifact compatibility review.',
      providerPortabilityImpact: 'Provider-neutral strict JSON and exact-substring validation.'
    },
    verdict,
    limitations: [
      'Recorded candidates, not real-provider outputs, drive this experiment.',
      'The dataset is small and contains only generic, Node.js, and Python evaluation fixtures.',
      'Official exact spans that contain command-like text may still fail the unchanged checklist content guard.'
    ]
  };
  return deepFreeze(output);
}

export function serializeExtractiveContractExperiment(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}
