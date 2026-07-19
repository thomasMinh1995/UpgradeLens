import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { ARTIFACT_GENERATOR_NAME, VERSION } from './constants.js';
import { VERSION_ANALYSIS_PROMPT_VERSION } from './ai-version-analysis.js';

export const EVALUATION_REPORT_SCHEMA_VERSION = '1.0.0';

const schema = JSON.parse(await readFile(
  new URL('../schemas/evaluation-report.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function ratio(passed, total) {
  return total === 0 ? 1 : passed / total;
}

function metric(caseResults, selector) {
  return ratio(caseResults.filter((item) => selector(item).passed).length, caseResults.length);
}

export function buildEvaluationReport({
  datasetPath,
  datasetVersion = '1.0.0',
  promptVersion = VERSION_ANALYSIS_PROMPT_VERSION,
  model = { provider: 'unknown', name: 'unknown' },
  caseResults,
  generatedAt = new Date()
}) {
  const passed = caseResults.filter((item) => item.passed).length;
  const report = {
    schemaVersion: EVALUATION_REPORT_SCHEMA_VERSION,
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
    generator: { name: ARTIFACT_GENERATOR_NAME, version: VERSION },
    evaluation: {
      datasetPath,
      datasetVersion,
      promptVersion,
      caseCount: caseResults.length
    },
    model,
    summary: {
      totalCases: caseResults.length,
      passed,
      failed: caseResults.length - passed
    },
    metrics: {
      riskClassificationAccuracy: metric(caseResults, (item) => item.checks.riskLevel),
      humanReviewAccuracy: metric(caseResults, (item) => item.checks.humanReview),
      evidenceReferenceAccuracy: metric(caseResults, (item) => item.checks.evidenceReferences),
      schemaValidationPassRate: metric(caseResults, (item) => item.checks.schema)
    },
    cases: caseResults
  };
  return validateEvaluationReport(report);
}

export function validateEvaluationReport(report) {
  if (report?.schemaVersion !== EVALUATION_REPORT_SCHEMA_VERSION) {
    throw new Error(`Evaluation Report validation error: unsupported schema version; expected ${EVALUATION_REPORT_SCHEMA_VERSION}.`);
  }
  if (!validateSchema(report)) {
    throw new Error(`Evaluation Report validation error: schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  return report;
}

export function serializeEvaluationReport(report) {
  validateEvaluationReport(report);
  return `${JSON.stringify(report, null, 2)}\n`;
}
