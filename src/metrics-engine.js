import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { ARTIFACT_GENERATOR_NAME, VERSION } from './constants.js';
import { validateEvaluationReport } from './evaluation-report.js';
import { compareText } from './portable.js';

export const METRICS_SCHEMA_VERSION = '1.0.0';
export const DEFAULT_METRICS_PATH = 'metrics.json';

const schema = JSON.parse(await readFile(
  new URL('../schemas/metrics.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function ratio(numerator, denominator, emptyValue = 1) {
  return denominator === 0 ? emptyValue : numerator / denominator;
}

function metric(passed, total) {
  return { value: ratio(passed, total), passed, total };
}

function boolCheck(caseResult, name) {
  return caseResult.checks?.[name]?.passed === true;
}

function sortedUnique(values = []) {
  return [...new Set(values)].sort(compareText);
}

function flattenRefs(refs = {}) {
  return sortedUnique([
    ...(refs.summary ?? []),
    ...(refs.risk ?? []),
    ...(refs.findings ?? [])
  ]);
}

function evidenceRefCounts(caseResult) {
  const expected = flattenRefs(caseResult.checks?.evidenceReferences?.expected);
  const actual = flattenRefs(caseResult.checks?.evidenceReferences?.actual);
  const actualSet = new Set(actual);
  return {
    expected: expected.length,
    actual: actual.length,
    matched: expected.filter((ref) => actualSet.has(ref)).length
  };
}

function validationWarningCodes(caseResult) {
  return sortedUnique(caseResult.checks?.validationState?.actual?.warningCodes ?? []);
}

function unsupportedClaimCount(caseResult) {
  return validationWarningCodes(caseResult).includes('CLAIMS_DROPPED') ? 1 : 0;
}

function actualFindingCount(caseResult) {
  return Array.isArray(caseResult.checks?.findings?.actual)
    ? caseResult.checks.findings.actual.length
    : 0;
}

function deterministicPassed(caseResult) {
  return boolCheck(caseResult, 'schema')
    && boolCheck(caseResult, 'evidenceReferences')
    && boolCheck(caseResult, 'validationState')
    && boolCheck(caseResult, 'findings');
}

function buildInput(report) {
  return {
    evaluationReport: {
      schemaVersion: report.schemaVersion,
      generatedAt: report.generatedAt,
      datasetPath: report.evaluation.datasetPath,
      datasetVersion: report.evaluation.datasetVersion,
      promptVersion: report.evaluation.promptVersion,
      model: structuredClone(report.model),
      caseCount: report.evaluation.caseCount
    }
  };
}

function buildCaseMetrics(report) {
  return report.cases
    .map((caseResult) => ({
      id: caseResult.id,
      category: caseResult.category,
      ecosystem: caseResult.ecosystem,
      passed: caseResult.passed,
      riskClassificationPassed: boolCheck(caseResult, 'riskLevel'),
      humanReviewPassed: boolCheck(caseResult, 'humanReview'),
      evidenceReferencesPassed: boolCheck(caseResult, 'evidenceReferences'),
      validationPassed: boolCheck(caseResult, 'schema') && boolCheck(caseResult, 'validationState'),
      deterministicPassed: deterministicPassed(caseResult),
      unsupportedClaimCount: unsupportedClaimCount(caseResult),
      actualFindingCount: actualFindingCount(caseResult)
    }))
    .sort((left, right) => compareText(left.id, right.id));
}

function metricsFromReport(report, cases) {
  const total = report.cases.length;
  const refCounts = report.cases.map(evidenceRefCounts);
  const matchedReferenceCount = refCounts.reduce((sum, item) => sum + item.matched, 0);
  const expectedReferenceCount = refCounts.reduce((sum, item) => sum + item.expected, 0);
  const unsupportedClaimCountTotal = cases.reduce((sum, item) => sum + item.unsupportedClaimCount, 0);
  const totalFindingCount = cases.reduce((sum, item) => sum + item.actualFindingCount, 0);
  const unsupportedDenominator = totalFindingCount + unsupportedClaimCountTotal;

  return {
    casePassRate: metric(report.summary.passed, total),
    riskClassificationAccuracy: metric(report.cases.filter((item) => boolCheck(item, 'riskLevel')).length, total),
    humanReviewAccuracy: metric(report.cases.filter((item) => boolCheck(item, 'humanReview')).length, total),
    humanReviewReasonAccuracy: metric(report.cases.filter((item) => boolCheck(item, 'humanReviewReasons')).length, total),
    evidenceReferenceAccuracy: metric(report.cases.filter((item) => boolCheck(item, 'evidenceReferences')).length, total),
    evidenceCoverageAccuracy: metric(report.cases.filter((item) => boolCheck(item, 'evidenceCoverage')).length, total),
    evidenceReferenceCoverage: {
      value: ratio(matchedReferenceCount, expectedReferenceCount),
      matchedReferenceCount,
      expectedReferenceCount
    },
    unsupportedClaimRate: {
      value: ratio(unsupportedClaimCountTotal, unsupportedDenominator, 0),
      unsupportedClaimCount: unsupportedClaimCountTotal,
      totalFindingCount,
      denominator: unsupportedDenominator
    },
    validationPassRate: metric(cases.filter((item) => item.validationPassed).length, total),
    deterministicPassRate: metric(cases.filter((item) => item.deterministicPassed).length, total)
  };
}

export function buildMetrics(report, { generatedAt = new Date() } = {}) {
  const validated = validateEvaluationReport(report);
  const cases = buildCaseMetrics(validated);
  const metrics = {
    schemaVersion: METRICS_SCHEMA_VERSION,
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
    generator: { name: ARTIFACT_GENERATOR_NAME, version: VERSION },
    input: buildInput(validated),
    summary: structuredClone(validated.summary),
    metrics: metricsFromReport(validated, cases),
    cases
  };
  return validateMetrics(metrics);
}

export function validateMetrics(metrics) {
  if (metrics?.schemaVersion !== METRICS_SCHEMA_VERSION) {
    throw new Error(`Metrics validation error: unsupported schema version; expected ${METRICS_SCHEMA_VERSION}.`);
  }
  if (!validateSchema(metrics)) {
    throw new Error(`Metrics validation error: schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  return metrics;
}

export function serializeMetrics(metrics) {
  validateMetrics(metrics);
  return `${JSON.stringify(metrics, null, 2)}\n`;
}

export function metricsDigest(metrics) {
  return `sha256:${createHash('sha256').update(serializeMetrics(metrics)).digest('hex')}`;
}

export async function loadEvaluationReportForMetrics(reportPath) {
  try {
    return validateEvaluationReport(JSON.parse(await readFile(reportPath, 'utf8')));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Evaluation Report is not valid JSON: ${reportPath}.`);
    throw error;
  }
}

export async function writeMetrics(outputPath, metrics) {
  const target = path.resolve(outputPath);
  const temporary = `${target}.${process.pid}.tmp`;
  const contents = serializeMetrics(metrics);
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
