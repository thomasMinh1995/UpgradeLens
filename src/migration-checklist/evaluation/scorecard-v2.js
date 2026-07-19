import { compareText } from '../../portable.js';

const METRIC_SECTIONS = Object.freeze({
  liveProviderQuality: [
    'actionSupportPrecision', 'publishedUnsupportedActionRate', 'ambiguousPublishedActionRate',
    'actionSpecificityRate', 'identifierSpecificityRate', 'versionScopePreservationRate',
    'abstentionPrecision', 'abstentionRecall', 'falseAbstentionRate',
    'safeCandidateAcceptanceRate', 'liveProviderCompletionRate'
  ],
  trustContainment: [
    'unsafeCandidateContainmentRate', 'inventedIdentifierContainmentRate',
    'prohibitedCapabilityContainmentRate', 'invalidEvidenceContainmentRate',
    'wholeCandidateContainmentRate', 'recordedSafeCandidateAcceptanceRate'
  ],
  runtimeFailureHandling: [
    'injectedFailureFallbackRate', 'providerFailureIsolationRate',
    'schemaFailureContainmentRate', 'sanitizedFailureRate'
  ],
  sharedInvariants: [
    'stepEvidenceReferencePrecision', 'exactExcerptPassRate', 'locationPreservationRate',
    'identityPreservationRate', 'humanReviewCorrectnessRate',
    'versionUncertaintyPreservationRate', 'deterministicPostProcessingPassRate'
  ]
});

function formatRate(metric) {
  return metric.value === null
    ? `n/a (${metric.numerator}/${metric.denominator})`
    : `${(metric.value * 100).toFixed(2)}% (${metric.numerator}/${metric.denominator})`;
}

export function buildMigrationEvaluationScorecardV2(evaluation) {
  const section = (name) => Object.fromEntries(METRIC_SECTIONS[name]
    .filter((key) => evaluation.metrics.metrics[key])
    .map((key) => [key, structuredClone(evaluation.metrics.metrics[key])]));
  return Object.freeze({
    schemaVersion: '2.0.0',
    identity: structuredClone(evaluation.qualification.identity),
    coverage: structuredClone(evaluation.metrics.coverage),
    providerRequestCount: evaluation.metrics.runtime.providerRequestCount,
    sections: {
      liveProviderQuality: section('liveProviderQuality'),
      trustContainment: section('trustContainment'),
      runtimeFailureHandling: section('runtimeFailureHandling'),
      sharedInvariants: section('sharedInvariants')
    },
    criticalGates: structuredClone(evaluation.metrics.criticalGates),
    thresholdResults: structuredClone(evaluation.qualification.thresholdResults),
    limitations: structuredClone(evaluation.qualification.limitations),
    retainedFailureDetails: evaluation.cases.flatMap((item) => (
      structuredClone(item.retainedFailureDetails)
    )),
    verdict: evaluation.qualification.verdict
  });
}

export function renderMigrationEvaluationScorecardV2(scorecard) {
  const lines = [
    '# Migration Planning Evaluation Scorecard v2',
    '',
    `- Task: ${scorecard.identity.task}`,
    `- Dataset: ${scorecard.identity.datasetId}@${scorecard.identity.datasetVersion}`,
    `- Evaluation criteria: ${scorecard.identity.evaluationCriteriaId}@${scorecard.identity.evaluationCriteriaVersion}`,
    `- Comparator/normalization: ${scorecard.identity.comparatorVersion}/${scorecard.identity.normalizationVersion}`,
    `- Provider/model: ${scorecard.identity.runtime.provider}/${scorecard.identity.runtime.model}`,
    `- Runtime mode/adapter: ${scorecard.identity.runtime.mode}/${scorecard.identity.runtime.adapter}`,
    `- Real provider calls: ${scorecard.providerRequestCount}`,
    `- Verdict: ${scorecard.verdict}`,
    '',
    '## Fixture Coverage',
    '',
    `- Roles: ${JSON.stringify(scorecard.coverage.roles)}`,
    `- Live ecosystems: ${scorecard.coverage.ecosystems.join(', ')}`,
    `- Live actionable/abstention: ${scorecard.coverage.liveActionableCases}/${scorecard.coverage.liveAbstentionCases}`,
    `- Recorded unsafe/safe: ${scorecard.coverage.recordedUnsafeCases}/${scorecard.coverage.recordedSafeCases}`,
    `- Injected failures: ${scorecard.coverage.injectedFailureCases}`
  ];
  const headings = {
    liveProviderQuality: 'Live Provider Quality',
    trustContainment: 'Trust Containment',
    runtimeFailureHandling: 'Runtime Failure Handling',
    sharedInvariants: 'Shared Invariants'
  };
  for (const sectionName of Object.keys(headings)) {
    lines.push('', `## ${headings[sectionName]}`, '');
    for (const name of Object.keys(scorecard.sections[sectionName]).sort(compareText)) {
      const metric = scorecard.sections[sectionName][name];
      lines.push(`- ${name}: ${formatRate(metric)}; role=${metric.caseRole}; cases=${metric.applicableCaseCount}`);
    }
  }
  lines.push('', '## Critical Gates', '');
  for (const gate of scorecard.criticalGates) {
    lines.push(`- ${gate.id}: ${gate.passed ? 'PASS' : `FAIL (${gate.violations.join(', ')})`}`);
  }
  lines.push('', '## Thresholds', '');
  for (const item of scorecard.thresholdResults) {
    lines.push(`- ${item.metric}: ${item.passed ? 'PASS' : 'FAIL'}; actual=${item.actual ?? 'n/a'}; ${item.operator}=${item.threshold}`);
  }
  lines.push('', '## Limitations', '');
  if (scorecard.limitations.length === 0) lines.push('- None.');
  else for (const item of scorecard.limitations) lines.push(`- ${item.code}: ${item.message}`);
  lines.push('', '## Retained Sanitized Failure Details', '');
  lines.push(scorecard.retainedFailureDetails.length === 0
    ? '- None.' : `- ${scorecard.retainedFailureDetails.length} bounded record(s).`);
  return `${lines.join('\n')}\n`;
}
