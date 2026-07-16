import { readFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';

import { buildAiScorecard } from './ai-scorecard.js';
import {
  buildBenchmarkReport,
  serializeBenchmarkReport,
  writeBenchmarkReport
} from './benchmark-report.js';
import { runEvaluation } from './evaluation-runner.js';
import { buildMetrics } from './metrics-engine.js';
import { compareText } from './portable.js';

export const BENCHMARK_SCHEMA_VERSION = '1.0.0';
export const DEFAULT_BENCHMARK_CONFIG_PATH = 'benchmark.json';

const schema = JSON.parse(await readFile(
  new URL('../schemas/benchmark.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
const validateSchema = ajv.compile(schema);

function benchmarkError(message) {
  return new Error(`Benchmark config error: ${message}`);
}

function sortedUnique(values = []) {
  return [...new Set(values)].sort(compareText);
}

function validateBenchmarkConfigInvariants(config) {
  const ids = config.runs.map((run) => run.id);
  const duplicateIds = sortedUnique(ids.filter((id, index) => ids.indexOf(id) !== index));
  if (duplicateIds.length > 0) throw benchmarkError(`duplicate run id ${duplicateIds[0]}.`);
  return config;
}

export function validateBenchmarkConfig(config) {
  if (config?.schemaVersion !== BENCHMARK_SCHEMA_VERSION) {
    throw benchmarkError(`unsupported schema version; expected ${BENCHMARK_SCHEMA_VERSION}.`);
  }
  if (!validateSchema(config)) {
    throw benchmarkError(`schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  return validateBenchmarkConfigInvariants(config);
}

export async function loadBenchmarkConfig(configPath = DEFAULT_BENCHMARK_CONFIG_PATH) {
  try {
    return validateBenchmarkConfig(JSON.parse(await readFile(configPath, 'utf8')));
  } catch (error) {
    if (error instanceof SyntaxError) throw benchmarkError(`${configPath} is not valid JSON.`);
    throw error;
  }
}

function numberOrNull(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function tokenUsageFrom(response) {
  if (Number.isFinite(response?.tokenUsage)) return response.tokenUsage;
  if (Number.isFinite(response?.usage?.totalTokens)) return response.usage.totalTokens;
  if (Number.isFinite(response?.usage?.total_tokens)) return response.usage.total_tokens;
  return null;
}

function costFrom(response) {
  if (Number.isFinite(response?.estimatedCost)) return response.estimatedCost;
  if (Number.isFinite(response?.cost?.estimated)) return response.cost.estimated;
  return null;
}

function createPerformanceCollector() {
  const values = {
    latencyMs: [],
    tokenUsage: [],
    estimatedCost: []
  };
  return {
    record(response) {
      const latencyMs = numberOrNull(response?.latencyMs);
      const tokenUsage = numberOrNull(tokenUsageFrom(response));
      const estimatedCost = numberOrNull(costFrom(response));
      if (latencyMs !== null) values.latencyMs.push(latencyMs);
      if (tokenUsage !== null) values.tokenUsage.push(tokenUsage);
      if (estimatedCost !== null) values.estimatedCost.push(estimatedCost);
    },
    summary() {
      return {
        latencyMs: values.latencyMs.length === 0
          ? null
          : values.latencyMs.reduce((sum, value) => sum + value, 0) / values.latencyMs.length,
        tokenUsage: values.tokenUsage.length === 0
          ? null
          : values.tokenUsage.reduce((sum, value) => sum + value, 0),
        estimatedCost: values.estimatedCost.length === 0
          ? null
          : values.estimatedCost.reduce((sum, value) => sum + value, 0)
      };
    }
  };
}

function wrapRuntime(runtime, collector) {
  if (!runtime) return null;
  return {
    async generateStructured(request) {
      const response = await runtime.generateStructured(request);
      collector.record(response);
      return response;
    }
  };
}

function runMetrics(metrics, scorecard) {
  return {
    overallScore: scorecard.overallScore,
    riskAccuracy: metrics.metrics.riskClassificationAccuracy.value,
    humanReviewAccuracy: metrics.metrics.humanReviewAccuracy.value,
    evidenceQuality: scorecard.categoryScores.evidenceQuality,
    unsupportedClaimRate: metrics.metrics.unsupportedClaimRate.value,
    deterministicPassRate: metrics.metrics.deterministicPassRate.value
  };
}

function scorecardSummary(scorecard) {
  return {
    overallScore: scorecard.overallScore,
    categoryScores: structuredClone(scorecard.categoryScores),
    recommendationCodes: scorecard.recommendations.map((item) => item.code).sort(compareText)
  };
}

async function defaultRuntimeFactory(run) {
  if (run.runtime.type === 'goldenFake') return null;
  throw new Error(`Benchmark runtime ${run.runtime.type} requires an injected runtimeFactory.`);
}

export async function runBenchmark(configInput, {
  configPath = null,
  runtimeFactory = defaultRuntimeFactory,
  runEvaluationImplementation = runEvaluation,
  buildMetricsImplementation = buildMetrics,
  buildAiScorecardImplementation = buildAiScorecard,
  generatedAt = new Date()
} = {}) {
  const config = validateBenchmarkConfig(configInput);
  const runs = [];
  for (const run of config.runs) {
    const collector = createPerformanceCollector();
    const runtime = await runtimeFactory(run, config);
    const evaluationReport = await runEvaluationImplementation({
      datasetPath: run.datasetPath ?? config.datasetPath,
      runtime: wrapRuntime(runtime, collector),
      model: run.model,
      promptVersion: run.promptVersion,
      generatedAt
    });
    const metrics = buildMetricsImplementation(evaluationReport, { generatedAt });
    const scorecard = buildAiScorecardImplementation(metrics, { generatedAt });
    runs.push({
      id: run.id,
      promptVersion: run.promptVersion,
      model: structuredClone(run.model),
      runtime: structuredClone(run.runtime),
      datasetPath: path.resolve(run.datasetPath ?? config.datasetPath),
      evaluation: structuredClone(evaluationReport.summary),
      metrics: runMetrics(metrics, scorecard),
      scorecard: scorecardSummary(scorecard),
      performance: collector.summary()
    });
  }
  return buildBenchmarkReport({
    benchmark: {
      name: config.name,
      configPath,
      datasetPath: path.resolve(config.datasetPath)
    },
    runs,
    generatedAt
  });
}

export {
  serializeBenchmarkReport,
  writeBenchmarkReport
};
