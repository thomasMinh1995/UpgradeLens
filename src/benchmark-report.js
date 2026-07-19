import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { ARTIFACT_GENERATOR_NAME, VERSION } from './constants.js';
import { compareText } from './portable.js';

export const BENCHMARK_REPORT_SCHEMA_VERSION = '1.0.0';
export const DEFAULT_BENCHMARK_REPORT_PATH = 'benchmark-report.json';

const schema = JSON.parse(await readFile(
  new URL('../schemas/benchmark-report.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function nullableNumberCompare(left, right) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareRank(left, right) {
  return right.metrics.overallScore - left.metrics.overallScore
    || right.metrics.riskAccuracy - left.metrics.riskAccuracy
    || right.metrics.evidenceQuality - left.metrics.evidenceQuality
    || nullableNumberCompare(left.performance.latencyMs, right.performance.latencyMs)
    || nullableNumberCompare(left.performance.estimatedCost, right.performance.estimatedCost)
    || compareText(left.id, right.id);
}

function rankingFor(runs) {
  return [...runs].sort(compareRank).map((run, index) => ({
    rank: index + 1,
    runId: run.id,
    overallScore: run.metrics.overallScore,
    riskAccuracy: run.metrics.riskAccuracy,
    evidenceQuality: run.metrics.evidenceQuality,
    latencyMs: run.performance.latencyMs,
    estimatedCost: run.performance.estimatedCost
  }));
}

export function buildBenchmarkReport({
  benchmark,
  runs,
  generatedAt = new Date()
}) {
  const sortedRuns = [...runs].sort((left, right) => compareText(left.id, right.id));
  const report = {
    schemaVersion: BENCHMARK_REPORT_SCHEMA_VERSION,
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
    generator: { name: ARTIFACT_GENERATOR_NAME, version: VERSION },
    benchmark: {
      name: benchmark.name,
      configPath: benchmark.configPath ?? null,
      datasetPath: benchmark.datasetPath,
      runCount: sortedRuns.length
    },
    runs: sortedRuns,
    ranking: rankingFor(sortedRuns)
  };
  return validateBenchmarkReport(report);
}

export function validateBenchmarkReport(report) {
  if (report?.schemaVersion !== BENCHMARK_REPORT_SCHEMA_VERSION) {
    throw new Error(`Benchmark Report validation error: unsupported schema version; expected ${BENCHMARK_REPORT_SCHEMA_VERSION}.`);
  }
  if (!validateSchema(report)) {
    throw new Error(`Benchmark Report validation error: schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  const runIds = new Set(report.runs.map((run) => run.id));
  for (const entry of report.ranking) {
    if (!runIds.has(entry.runId)) {
      throw new Error(`Benchmark Report validation error: ranking references unknown run ${entry.runId}.`);
    }
  }
  return report;
}

export function serializeBenchmarkReport(report) {
  validateBenchmarkReport(report);
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function writeBenchmarkReport(outputPath, report) {
  const target = path.resolve(outputPath);
  const temporary = `${target}.${process.pid}.tmp`;
  const contents = serializeBenchmarkReport(report);
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
