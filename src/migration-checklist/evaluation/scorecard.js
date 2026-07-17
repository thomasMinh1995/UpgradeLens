import { compareText } from '../../portable.js';

function formatRate(metric) {
  return metric.value === null
    ? `n/a (${metric.numerator}/${metric.denominator})`
    : `${(metric.value * 100).toFixed(2)}% (${metric.numerator}/${metric.denominator})`;
}

/** Build a presentation-only scorecard from already computed results. */
export function buildMigrationEvaluationScorecard(evaluation) {
  const metrics = evaluation.metrics;
  return Object.freeze({
    schemaVersion: '1.0.0',
    identity: structuredClone(evaluation.qualification.identity),
    coverage: structuredClone(metrics.coverage),
    rawOutcomes: Object.fromEntries(
      ['ACTIONABLE', 'ABSTAIN', 'INVALID', 'RUNTIME_FAILURE'].map((outcome) => [
        outcome,
        evaluation.cases.filter((item) => item.raw.outcome === outcome).length
      ])
    ),
    trustOutcomes: Object.fromEntries(
      ['ACCEPTED', 'REJECTED', 'NOT_EVALUATED'].map((outcome) => [
        outcome,
        evaluation.cases.filter((item) => item.raw.trustDecision === outcome).length
      ])
    ),
    publishedOutcomes: {
      generated: metrics.runtime.generated,
      abstained: metrics.runtime.abstained,
      rejected: metrics.runtime.rejected,
      failed: metrics.runtime.failed
    },
    metrics: structuredClone(metrics.metrics),
    criticalGates: structuredClone(metrics.criticalGates),
    thresholdResults: structuredClone(evaluation.qualification.thresholdResults),
    limitations: structuredClone(evaluation.qualification.limitations),
    verdict: evaluation.qualification.verdict
  });
}

/** Render only precomputed scorecard data; this function never derives a verdict. */
export function renderMigrationEvaluationScorecard(scorecard) {
  const lines = [
    '# Migration Planning Evaluation Scorecard',
    '',
    `- Task: ${scorecard.identity.task}`,
    `- Dataset: ${scorecard.identity.datasetId}@${scorecard.identity.datasetVersion}`,
    `- Provider/model: ${scorecard.identity.runtime.provider}/${scorecard.identity.runtime.model}`,
    `- Runtime mode/adapter: ${scorecard.identity.runtime.mode}/${scorecard.identity.runtime.adapter}`,
    `- Verdict: ${scorecard.verdict}`,
    '',
    '## Coverage',
    '',
    `- Ecosystems: ${scorecard.coverage.ecosystems.join(', ')}`,
    `- Cases by ecosystem: ${JSON.stringify(scorecard.coverage.casesByEcosystem)}`,
    `- Cases by scenario group: ${JSON.stringify(scorecard.coverage.scenarioGroups)}`,
    `- Actionable quality cases: ${scorecard.coverage.actionableQualityCases}`,
    `- Abstention quality cases: ${scorecard.coverage.abstentionQualityCases}`,
    `- Adversarial policy probes: ${scorecard.coverage.adversarialPolicyProbes}`,
    '',
    '## Raw / Trust / Published',
    '',
    `- Raw: ${JSON.stringify(scorecard.rawOutcomes)}`,
    `- Trust: ${JSON.stringify(scorecard.trustOutcomes)}`,
    `- Published: ${JSON.stringify(scorecard.publishedOutcomes)}`,
    '',
    '## Metrics',
    ''
  ];
  for (const name of Object.keys(scorecard.metrics).sort(compareText)) {
    lines.push(`- ${name}: ${formatRate(scorecard.metrics[name])}`);
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
  return `${lines.join('\n')}\n`;
}
