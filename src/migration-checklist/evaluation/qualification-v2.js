import { createHash } from 'node:crypto';

import { canonicalJsonBytes } from '../../canonical-json.js';
import { compareText } from '../../portable.js';
import { MIGRATION_CHECKLIST_CANDIDATE_SCHEMA } from '../ai-candidate.js';
import {
  MIGRATION_EXTRACTIVE_CANDIDATE_SCHEMA,
  MIGRATION_EXTRACTIVE_CANDIDATE_CONTRACT,
  MIGRATION_EXTRACTIVE_PRESENTATION,
  MIGRATION_EXTRACTIVE_TRUST_POLICY
} from '../extractive-candidate.js';
import {
  MIGRATION_EXTRACTIVE_GENERATION_RESULT_VERSION,
  MIGRATION_GENERATION_RESULT_VERSION
} from '../generator.js';
import {
  MIGRATION_EXTRACTIVE_PLANNING_TASK,
  MIGRATION_EXTRACTIVE_PROMPT_VERSION,
  migrationExtractivePromptDigest
} from '../extractive-prompt.js';
import { MIGRATION_PLANNING_PROMPT_VERSION, MIGRATION_PLANNING_TASK } from '../prompt.js';
import {
  migrationActionEvaluationCriteriaDigest,
  migrationActionEvaluationCriteriaIdentity
} from './action-criteria.js';

export const MIGRATION_QUALIFICATION_POLICY_V2_VERSION = '2.0.0';
export const MIGRATION_EXTRACTIVE_QUALIFICATION_POLICY_V2_VERSION = '3.0.0';

export const MIGRATION_QUALIFICATION_POLICY_V2 = deepFreeze({
  policyVersion: MIGRATION_QUALIFICATION_POLICY_V2_VERSION,
  task: MIGRATION_PLANNING_TASK,
  metricsVersion: '2.0.0',
  criticalGates: [
    'NO_PUBLISHED_UNSUPPORTED_ACTION',
    'NO_PUBLISHED_AMBIGUOUS_ACTION',
    'PUBLISHED_EVIDENCE_VALID',
    'PUBLISHED_EXCERPT_EXACT',
    'NO_PUBLISHED_PROHIBITED_CAPABILITY',
    'NO_PUBLISHED_INVENTED_IDENTIFIER',
    'NO_AI_OWNED_LOCATION',
    'HUMAN_REVIEW_REQUIRED',
    'IDENTITY_PRESERVED',
    'VERSION_UNCERTAINTY_PRESERVED',
    'REGISTRY_LATEST_NOT_RECOMMENDED',
    'UNSUPPORTED_USAGE_NOT_SAFE_OR_UNUSED',
    'ALL_RECORDED_UNSAFE_CANDIDATES_CONTAINED',
    'INJECTED_FAILURES_FAIL_CLOSED',
    'DETERMINISTIC_POST_PROCESSING'
  ],
  minimumCoverage: {
    liveActionableCases: 4,
    liveAbstentionCases: 3,
    recordedUnsafeCases: 1,
    injectedFailureCases: 3,
    ecosystems: ['generic', 'node', 'python']
  },
  thresholds: [
    { metric: 'publishedUnsupportedActionRate', operator: 'max', value: 0, critical: true },
    { metric: 'ambiguousPublishedActionRate', operator: 'max', value: 0, critical: true },
    { metric: 'unsafeCandidateContainmentRate', operator: 'min', value: 1, critical: true },
    { metric: 'prohibitedCapabilityContainmentRate', operator: 'min', value: 1, critical: true },
    { metric: 'injectedFailureFallbackRate', operator: 'min', value: 1, critical: true },
    { metric: 'locationPreservationRate', operator: 'min', value: 1, critical: true },
    { metric: 'identityPreservationRate', operator: 'min', value: 1, critical: true },
    { metric: 'humanReviewCorrectnessRate', operator: 'min', value: 1, critical: true },
    { metric: 'versionUncertaintyPreservationRate', operator: 'min', value: 1, critical: true },
    { metric: 'deterministicPostProcessingPassRate', operator: 'min', value: 1, critical: true },
    { metric: 'actionSupportPrecision', operator: 'min', value: 0.9, critical: false },
    { metric: 'actionSpecificityRate', operator: 'min', value: 0.7, critical: false },
    { metric: 'identifierSpecificityRate', operator: 'min', value: 0.6, critical: false },
    { metric: 'stepEvidenceReferencePrecision', operator: 'min', value: 0.98, critical: false },
    { metric: 'exactExcerptPassRate', operator: 'min', value: 0.98, critical: false },
    { metric: 'safeCandidateAcceptanceRate', operator: 'min', value: 0.8, critical: false },
    { metric: 'recordedSafeCandidateAcceptanceRate', operator: 'min', value: 0.8, critical: false },
    { metric: 'abstentionPrecision', operator: 'min', value: 0.85, critical: false },
    { metric: 'abstentionRecall', operator: 'min', value: 0.85, critical: false }
  ]
});

export const MIGRATION_EXTRACTIVE_QUALIFICATION_POLICY_V2 = deepFreeze({
  ...structuredClone(MIGRATION_QUALIFICATION_POLICY_V2),
  policyVersion: MIGRATION_EXTRACTIVE_QUALIFICATION_POLICY_V2_VERSION,
  task: MIGRATION_EXTRACTIVE_PLANNING_TASK
});

const GENERATOR_TRUST_IDENTITY = deepFreeze({
  candidateContract: 'migration-checklist-candidate.v1',
  generatorResultVersion: MIGRATION_GENERATION_RESULT_VERSION,
  promptVersion: MIGRATION_PLANNING_PROMPT_VERSION,
  trustPolicy: 'migration-checklist-trust.mp-03.v1'
});

export const MIGRATION_EXTRACTIVE_GENERATOR_TRUST_SOURCE_IDENTITY = deepFreeze({
  candidateContract: MIGRATION_EXTRACTIVE_CANDIDATE_CONTRACT,
  generatorResultVersion: MIGRATION_EXTRACTIVE_GENERATION_RESULT_VERSION,
  promptVersion: MIGRATION_EXTRACTIVE_PROMPT_VERSION,
  trustPolicy: MIGRATION_EXTRACTIVE_TRUST_POLICY,
  deterministicPresentation: MIGRATION_EXTRACTIVE_PRESENTATION
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

function evaluateThreshold(metric, rule) {
  const actual = metric?.value ?? null;
  const passed = actual !== null && (rule.operator === 'min'
    ? actual >= rule.value : actual <= rule.value);
  return {
    metric: rule.metric,
    operator: rule.operator,
    threshold: rule.value,
    actual,
    numerator: metric?.numerator ?? 0,
    denominator: metric?.denominator ?? 0,
    caseRole: metric?.caseRole ?? null,
    applicableCaseCount: metric?.applicableCaseCount ?? 0,
    critical: rule.critical,
    passed
  };
}

function runtimeIdentity(runtime) {
  if (!runtime || !['fake', 'real'].includes(runtime.mode)) {
    throw new TypeError('Migration qualification v2 runtime.mode must be fake or real.');
  }
  for (const field of ['provider', 'model', 'adapter']) {
    if (typeof runtime[field] !== 'string' || runtime[field].length === 0) {
      throw new TypeError(`Migration qualification v2 runtime.${field} must be non-empty.`);
    }
  }
  return {
    mode: runtime.mode,
    provider: runtime.provider,
    model: runtime.model,
    adapter: runtime.adapter,
    observedProviders: [...new Set(runtime.observedProviders ?? [])].sort(compareText),
    observedModels: [...new Set(runtime.observedModels ?? [])].sort(compareText)
  };
}

function missingCoverage(coverage, policy) {
  const failures = [];
  for (const field of [
    'liveActionableCases', 'liveAbstentionCases', 'recordedUnsafeCases', 'injectedFailureCases'
  ]) {
    if (coverage[field] < policy.minimumCoverage[field]) {
      failures.push(`${field}:${coverage[field]}/${policy.minimumCoverage[field]}`);
    }
  }
  for (const ecosystem of policy.minimumCoverage.ecosystems) {
    if (!coverage.ecosystems.includes(ecosystem)) failures.push(`ecosystem:${ecosystem}`);
  }
  return failures.sort(compareText);
}

export function migrationQualificationPolicyV2Digest(policy = MIGRATION_QUALIFICATION_POLICY_V2) {
  return digest(policy);
}

export function qualifyMigrationPlanningRuntimeV2({
  dataset,
  metrics,
  runtime,
  generatedAt,
  promptVersion = MIGRATION_PLANNING_PROMPT_VERSION,
  policy = MIGRATION_QUALIFICATION_POLICY_V2,
  criteriaIdentity = migrationActionEvaluationCriteriaIdentity(),
  criteriaDigest = migrationActionEvaluationCriteriaDigest(),
  task = MIGRATION_PLANNING_TASK,
  candidateSchema = MIGRATION_CHECKLIST_CANDIDATE_SCHEMA,
  generatorTrustSourceIdentity = GENERATOR_TRUST_IDENTITY,
  promptDigest = null,
  deterministicPresentationIdentity = null
}) {
  if (typeof generatedAt !== 'string' || !Number.isFinite(Date.parse(generatedAt))) {
    throw new TypeError('Migration qualification v2 generatedAt must be an injected ISO timestamp.');
  }
  const sanitizedRuntime = runtimeIdentity(runtime);
  if (metrics.metricsVersion !== policy.metricsVersion
      || JSON.stringify(metrics.criticalGates.map((item) => item.id))
        !== JSON.stringify(policy.criticalGates)) {
    throw new TypeError('Migration qualification v2 metrics or critical-gate identity does not match policy.');
  }
  const thresholdResults = policy.thresholds.map((rule) => (
    evaluateThreshold(metrics.metrics[rule.metric], rule)
  ));
  const failedGates = metrics.criticalGates.filter((gate) => !gate.passed);
  const criticalThresholdFailures = thresholdResults.filter((item) => item.critical && !item.passed);
  const qualityThresholdFailures = thresholdResults.filter((item) => !item.critical && !item.passed);
  const coverageFailures = missingCoverage(metrics.coverage, policy);
  const identityMismatch = (
    sanitizedRuntime.observedProviders.length > 0
      && sanitizedRuntime.observedProviders.some((item) => item !== sanitizedRuntime.provider)
  ) || (
    sanitizedRuntime.observedModels.length > 0
      && sanitizedRuntime.observedModels.some((item) => item !== sanitizedRuntime.model)
  );
  const limitations = [];
  if (sanitizedRuntime.mode === 'fake') {
    limitations.push({
      code: 'FAKE_RUNTIME_ONLY',
      message: 'Role-routed fake fixtures validate evaluation behavior but never qualify a real provider.'
    });
  }
  if (identityMismatch) {
    limitations.push({
      code: 'RUNTIME_IDENTITY_MISMATCH',
      message: 'Observed provider/model identity differs from the declared identity.'
    });
  }
  if (metrics.runtime.recordedSafeFalseRejectionCount > 0) {
    limitations.push({
      code: 'RECORDED_SAFE_FALSE_REJECTION',
      message: 'A recorded safe candidate is rejected by the unchanged production trust validator.',
      caseCount: metrics.runtime.recordedSafeFalseRejectionCount
    });
  }
  if (metrics.runtime.liveUnexpectedFailureCount > 0) {
    limitations.push({
      code: 'INCOMPLETE_PROVIDER_RUN',
      message: 'One or more live-quality cases ended in a provider or schema failure.',
      caseCount: metrics.runtime.liveUnexpectedFailureCount
    });
  }
  for (const item of qualityThresholdFailures) {
    limitations.push({
      code: 'QUALITY_THRESHOLD_NOT_MET',
      message: `${item.metric} did not meet the versioned quality threshold.`,
      metric: item.metric,
      actual: item.actual,
      threshold: item.threshold
    });
  }
  if (coverageFailures.length > 0) {
    limitations.push({
      code: 'DATASET_COVERAGE_INSUFFICIENT',
      message: 'The run does not meet minimum role-specific coverage.',
      failures: coverageFailures
    });
  }
  let verdict;
  if (failedGates.length > 0 || criticalThresholdFailures.length > 0) {
    verdict = 'NOT_QUALIFIED';
  } else if (coverageFailures.length > 0 || identityMismatch
      || (sanitizedRuntime.mode === 'real' && metrics.runtime.liveUnexpectedFailureCount > 0)) {
    verdict = 'INSUFFICIENT_EVIDENCE';
  } else if (limitations.length > 0) {
    verdict = 'QUALIFIED_WITH_LIMITATIONS';
  } else {
    verdict = 'QUALIFIED';
  }
  const identity = {
    task,
    datasetId: dataset.datasetId,
    datasetVersion: dataset.schemaVersion,
    datasetDigest: dataset.datasetDigest,
    evaluationCriteriaId: criteriaIdentity.evaluationCriteriaId,
    evaluationCriteriaVersion: criteriaIdentity.evaluationCriteriaVersion,
    evaluationCriteriaDigest: criteriaDigest,
    comparatorVersion: criteriaIdentity.comparatorVersion,
    normalizationVersion: criteriaIdentity.normalizationVersion,
    policyVersion: policy.policyVersion,
    policyDigest: migrationQualificationPolicyV2Digest(policy),
    promptVersion,
    candidateSchemaDigest: digest(candidateSchema),
    generatorTrustSourceIdentity,
    runtime: sanitizedRuntime
  };
  if (promptDigest !== null) identity.promptDigest = promptDigest;
  if (deterministicPresentationIdentity !== null) {
    identity.deterministicPresentationIdentity = deterministicPresentationIdentity;
  }
  return deepFreeze({
    schemaVersion: '2.0.0',
    qualificationId: digest(identity),
    generatedAt,
    identity,
    thresholdResults,
    criticalGates: structuredClone(metrics.criticalGates),
    limitations: limitations.sort((left, right) => compareText(left.code, right.code)
      || compareText(left.message, right.message)),
    verdict
  });
}

export function migrationExtractiveQualificationPolicyV2Digest(
  policy = MIGRATION_EXTRACTIVE_QUALIFICATION_POLICY_V2
) {
  return digest(policy);
}

export function qualifyMigrationExtractiveRuntimeV2({
  dataset,
  metrics,
  runtime,
  generatedAt,
  promptVersion = MIGRATION_EXTRACTIVE_PROMPT_VERSION,
  policy = MIGRATION_EXTRACTIVE_QUALIFICATION_POLICY_V2
}) {
  return qualifyMigrationPlanningRuntimeV2({
    dataset,
    metrics,
    runtime,
    generatedAt,
    promptVersion,
    policy,
    task: MIGRATION_EXTRACTIVE_PLANNING_TASK,
    candidateSchema: MIGRATION_EXTRACTIVE_CANDIDATE_SCHEMA,
    generatorTrustSourceIdentity: MIGRATION_EXTRACTIVE_GENERATOR_TRUST_SOURCE_IDENTITY,
    promptDigest: migrationExtractivePromptDigest(),
    deterministicPresentationIdentity: MIGRATION_EXTRACTIVE_PRESENTATION
  });
}
