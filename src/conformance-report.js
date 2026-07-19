import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalJsonBytes } from './canonical-json.js';
import { ARTIFACT_GENERATOR_NAME, VERSION } from './constants.js';
import { compareText } from './portable.js';
import { RUNTIME_CONFORMANCE_CAPABILITIES } from './runtime-conformance.js';

export const CONFORMANCE_REPORT_SCHEMA_VERSION = '1.0.0';

const schema = JSON.parse(await readFile(
  new URL('../schemas/conformance-report.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function capabilitySummary(caseResults) {
  return Object.fromEntries(RUNTIME_CONFORMANCE_CAPABILITIES.map((capability) => {
    const relevant = caseResults.filter((result) => result.capabilities.includes(capability));
    if (relevant.some((result) => result.status === 'FAIL')) return [capability, 'FAIL'];
    if (relevant.length > 0 && relevant.every((result) => result.capabilityStatus === 'NOT_SUPPORTED')) {
      return [capability, 'NOT_SUPPORTED'];
    }
    return [capability, 'PASS'];
  }));
}

function recommendationFor(caseResults) {
  if (caseResults.some((result) => result.required && result.status === 'FAIL')) return 'NON_CONFORMANT';
  if (caseResults.some((result) => result.status === 'FAIL' || result.status === 'SKIP')) {
    return 'PARTIALLY_CONFORMANT';
  }
  return 'CONFORMANT';
}

export function buildConformanceReport({
  runtime,
  caseResults,
  deploymentProfileDigest,
  capabilityProfileDigest,
  conformanceScope = 'offline-runtime-protocol',
  generatedAt = new Date()
}) {
  const sortedResults = [...caseResults].sort((left, right) => compareText(left.id, right.id));
  const cases = sortedResults.map((result) => ({
    id: result.id,
    capability: result.capability,
    required: result.required,
    status: result.status,
    expected: result.expected,
    observed: result.observed
  }));
  const failedResults = sortedResults.filter((result) => result.status === 'FAIL');
  const report = {
    schemaVersion: CONFORMANCE_REPORT_SCHEMA_VERSION,
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
    generator: { name: ARTIFACT_GENERATOR_NAME, version: VERSION },
    suite: {
      mode: 'offlineFixture',
      protocol: 'openai-compatible-chat-completions',
      scope: conformanceScope,
      caseCount: cases.length
    },
    runtime: {
      provider: runtime.provider,
      model: runtime.model
    },
    deploymentProfileDigest,
    capabilityProfileDigest,
    conformanceScope,
    summary: {
      total: cases.length,
      passed: cases.filter((result) => result.status === 'PASS').length,
      failed: failedResults.length,
      skipped: cases.filter((result) => result.status === 'SKIP').length
    },
    capabilities: capabilitySummary(sortedResults),
    cases,
    failures: failedResults.map((result) => ({
      caseId: result.id,
      code: result.observed,
      message: 'Observed runtime behavior did not match the conformance contract.'
    })),
    recommendation: recommendationFor(sortedResults)
  };
  return validateConformanceReport(report);
}

export function validateConformanceReport(report) {
  if (report?.schemaVersion !== CONFORMANCE_REPORT_SCHEMA_VERSION) {
    throw new Error(`Conformance Report validation error: unsupported schema version; expected ${CONFORMANCE_REPORT_SCHEMA_VERSION}.`);
  }
  if (!validateSchema(report)) {
    throw new Error(`Conformance Report validation error: schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  if (report.suite.caseCount !== report.cases.length || report.summary.total !== report.cases.length) {
    throw new Error('Conformance Report validation error: case totals do not match the case list.');
  }
  if (report.suite.scope !== report.conformanceScope) {
    throw new Error('Conformance Report validation error: suite scope does not match conformanceScope.');
  }
  const counted = report.summary.passed + report.summary.failed + report.summary.skipped;
  if (counted !== report.summary.total) {
    throw new Error('Conformance Report validation error: summary counts do not add up to the total.');
  }
  const caseIds = new Set();
  for (const result of report.cases) {
    if (caseIds.has(result.id)) throw new Error(`Conformance Report validation error: duplicate case ${result.id}.`);
    caseIds.add(result.id);
  }
  for (const failure of report.failures) {
    const result = report.cases.find((entry) => entry.id === failure.caseId);
    if (!result || result.status !== 'FAIL') {
      throw new Error(`Conformance Report validation error: failure references non-failed case ${failure.caseId}.`);
    }
  }
  if (report.failures.length !== report.summary.failed) {
    throw new Error('Conformance Report validation error: failure count does not match the summary.');
  }
  return report;
}

export function serializeConformanceReport(report) {
  validateConformanceReport(report);
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function conformanceReportDigest(report) {
  validateConformanceReport(report);
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(report)).digest('hex')}`;
}

export async function writeConformanceReport(outputPath, report) {
  const target = path.resolve(outputPath);
  const temporary = `${target}.${process.pid}.tmp`;
  const contents = serializeConformanceReport(report);
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
