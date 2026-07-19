import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { ARTIFACT_GENERATOR_NAME, VERSION } from './constants.js';
import { compareText } from './portable.js';
import { validateMetrics } from './metrics-engine.js';

export const AI_SCORECARD_SCHEMA_VERSION = '1.0.0';
export const DEFAULT_AI_SCORECARD_PATH = 'ai-scorecard.json';

const schema = JSON.parse(await readFile(
  new URL('../schemas/ai-scorecard.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

const SEVERITY_ORDER = new Map([
  ['high', 0],
  ['medium', 1],
  ['info', 2]
]);

function score(value) {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function metricValues(metrics) {
  return {
    casePassRate: metrics.metrics.casePassRate.value,
    riskClassificationAccuracy: metrics.metrics.riskClassificationAccuracy.value,
    humanReviewAccuracy: metrics.metrics.humanReviewAccuracy.value,
    humanReviewReasonAccuracy: metrics.metrics.humanReviewReasonAccuracy.value,
    evidenceReferenceAccuracy: metrics.metrics.evidenceReferenceAccuracy.value,
    evidenceCoverageAccuracy: metrics.metrics.evidenceCoverageAccuracy.value,
    evidenceReferenceCoverage: metrics.metrics.evidenceReferenceCoverage.value,
    unsupportedClaimRate: metrics.metrics.unsupportedClaimRate.value,
    validationPassRate: metrics.metrics.validationPassRate.value,
    deterministicPassRate: metrics.metrics.deterministicPassRate.value
  };
}

function categoryScores(values) {
  const unsupportedClaimScore = 1 - values.unsupportedClaimRate;
  return {
    riskAnalysis: score(values.riskClassificationAccuracy),
    humanReview: score(average([
      values.humanReviewAccuracy,
      values.humanReviewReasonAccuracy
    ])),
    evidenceQuality: score(average([
      values.evidenceReferenceAccuracy,
      values.evidenceCoverageAccuracy,
      values.evidenceReferenceCoverage,
      unsupportedClaimScore
    ])),
    trustLayer: score(average([
      values.validationPassRate,
      unsupportedClaimScore,
      values.humanReviewAccuracy
    ])),
    deterministicQuality: score(values.deterministicPassRate)
  };
}

function recommendation(severity, category, code, message) {
  return { severity, category, code, message };
}

function buildRecommendations(values, categories) {
  const recommendations = [];
  if (values.riskClassificationAccuracy < 0.9) {
    recommendations.push(recommendation(
      'high',
      'Risk Analysis',
      'RISK_CLASSIFICATION_LOW',
      'Review risk prompt guidance and golden evidence coverage for risk classification misses.'
    ));
  }
  if (values.humanReviewAccuracy < 0.95 || values.humanReviewReasonAccuracy < 0.95) {
    recommendations.push(recommendation(
      'high',
      'Human Review',
      'HUMAN_REVIEW_POLICY_LOW',
      'Review deterministic human-review policy and expected review reasons.'
    ));
  }
  if (values.evidenceReferenceAccuracy < 0.95 || values.evidenceReferenceCoverage < 0.95) {
    recommendations.push(recommendation(
      'high',
      'Evidence Quality',
      'EVIDENCE_REFERENCE_LOW',
      'Improve evidence selection and reference preservation before comparing models.'
    ));
  }
  if (values.unsupportedClaimRate > 0.05) {
    recommendations.push(recommendation(
      'medium',
      'Evidence Quality',
      'UNSUPPORTED_CLAIMS_DETECTED',
      'Improve grounding and evidence selection to reduce unsupported claims.'
    ));
  }
  if (values.validationPassRate < 0.98) {
    recommendations.push(recommendation(
      'high',
      'Trust Layer',
      'VALIDATION_PASS_RATE_LOW',
      'Review structured output validation and trust validation failure modes.'
    ));
  }
  if (values.deterministicPassRate < 1) {
    recommendations.push(recommendation(
      'high',
      'Deterministic Quality',
      'DETERMINISTIC_PASS_RATE_LOW',
      'Investigate deterministic rule violations or lost evidence references.'
    ));
  }
  if (Object.values(categories).every((value) => value >= 95)) {
    recommendations.push(recommendation(
      'info',
      'General',
      'READY_FOR_BENCHMARK',
      'Quality gates are high enough to proceed to AE-04 benchmark design.'
    ));
  }
  return recommendations.sort((left, right) =>
    (SEVERITY_ORDER.get(left.severity) ?? 99) - (SEVERITY_ORDER.get(right.severity) ?? 99)
    || compareText(left.category, right.category)
    || compareText(left.code, right.code)
  );
}

export function buildAiScorecard(metrics, { generatedAt = new Date() } = {}) {
  const validated = validateMetrics(metrics);
  const values = metricValues(validated);
  const categories = categoryScores(values);
  const overallScore = Math.round(average(Object.values(categories)));
  const scorecard = {
    schemaVersion: AI_SCORECARD_SCHEMA_VERSION,
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
    generator: { name: ARTIFACT_GENERATOR_NAME, version: VERSION },
    input: {
      metrics: {
        schemaVersion: validated.schemaVersion,
        generatedAt: validated.generatedAt,
        datasetVersion: validated.input.evaluationReport.datasetVersion,
        promptVersion: validated.input.evaluationReport.promptVersion,
        model: structuredClone(validated.input.evaluationReport.model),
        caseCount: validated.summary.totalCases
      }
    },
    overallScore,
    categoryScores: categories,
    metricDetails: values,
    recommendations: buildRecommendations(values, categories)
  };
  return validateAiScorecard(scorecard);
}

export function validateAiScorecard(scorecard) {
  if (scorecard?.schemaVersion !== AI_SCORECARD_SCHEMA_VERSION) {
    throw new Error(`AI Scorecard validation error: unsupported schema version; expected ${AI_SCORECARD_SCHEMA_VERSION}.`);
  }
  if (!validateSchema(scorecard)) {
    throw new Error(`AI Scorecard validation error: schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  return scorecard;
}

export function serializeAiScorecard(scorecard) {
  validateAiScorecard(scorecard);
  return `${JSON.stringify(scorecard, null, 2)}\n`;
}

export async function writeAiScorecard(outputPath, scorecard) {
  const target = path.resolve(outputPath);
  const temporary = `${target}.${process.pid}.tmp`;
  const contents = serializeAiScorecard(scorecard);
  await mkdir(path.dirname(target), { recursive: true });
  let handle;
  try {
    handle = await open(temporary, 'w', 0o600);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return target;
}
