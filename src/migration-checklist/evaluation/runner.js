import { canonicalJson } from '../../canonical-json.js';
import { isAiRuntimeError, AiRuntimeError } from '../../ai-runtime-error.js';
import { compareText } from '../../portable.js';
import { generateMigrationChecklistForContext } from '../generator.js';
import { MIGRATION_PLANNING_PROMPT_VERSION, MIGRATION_PLANNING_TASK } from '../prompt.js';
import { compareMigrationEvaluationCase } from './comparator.js';
import {
  buildMigrationEvaluationContext,
  createMigrationGoldenFakeRuntime,
  loadMigrationEvaluationDataset,
  migrationEvaluationDatasetDigest,
  validateMigrationEvaluationDataset
} from './dataset.js';
import { computeMigrationEvaluationMetrics } from './metrics.js';
import { qualifyMigrationPlanningRuntime } from './qualification.js';
import { buildMigrationEvaluationScorecard } from './scorecard.js';

export const MIGRATION_EVALUATION_REPORT_VERSION = '1.0.0';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function coreDataset(dataset) {
  return {
    schemaVersion: dataset.schemaVersion,
    datasetId: dataset.datasetId,
    task: dataset.task,
    cases: structuredClone(dataset.cases)
  };
}

function isoTimestamp(value) {
  const timestamp = value instanceof Date ? value.toISOString() : value;
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) {
    throw new TypeError('Migration evaluation generatedAt must be an injected Date or ISO timestamp.');
  }
  return timestamp;
}

function runtimeIdentity(mode, metadata = {}) {
  const unknownFields = Object.keys(metadata).filter((field) => (
    !['provider', 'model', 'adapter'].includes(field)
  ));
  if (unknownFields.length > 0) {
    throw new TypeError(`Migration evaluation runtimeMetadata contains unsupported field ${unknownFields.sort(compareText)[0]}.`);
  }
  const defaults = mode === 'fake' ? {
    provider: 'migration-golden-fake',
    model: '1.0.0',
    adapter: 'recorded-candidate-runtime'
  } : {};
  const identity = { mode, ...defaults, ...metadata };
  for (const field of ['provider', 'model', 'adapter']) {
    if (typeof identity[field] !== 'string' || identity[field].length === 0) {
      throw new TypeError(`Real migration evaluation requires runtimeMetadata.${field}.`);
    }
  }
  return identity;
}

function replayRuntime(rawOutput, runtimeErrorCode, identity) {
  return {
    async generateStructured() {
      if (runtimeErrorCode) {
        throw new AiRuntimeError(runtimeErrorCode, 'Recorded sanitized runtime failure.', {
          retryable: false
        });
      }
      return {
        output: structuredClone(rawOutput),
        provider: identity.provider,
        model: identity.model,
        latencyMs: 0
      };
    }
  };
}

async function evaluateCase(goldenCase, activeRuntime, identity, promptVersion) {
  const context = buildMigrationEvaluationContext(goldenCase);
  let rawOutput;
  let runtimeErrorCode = null;
  const observedIdentity = {};
  const capturingRuntime = {
    async generateStructured(request) {
      try {
        const result = await activeRuntime.generateStructured(request);
        rawOutput = structuredClone(result?.output);
        if (typeof result?.provider === 'string') observedIdentity.provider = result.provider;
        if (typeof result?.model === 'string') observedIdentity.model = result.model;
        return result;
      } catch (error) {
        runtimeErrorCode = isAiRuntimeError(error) ? error.code : 'UNKNOWN';
        throw error;
      }
    }
  };
  const generation = await generateMigrationChecklistForContext(context, {
    aiRuntime: capturingRuntime,
    runId: `migration-evaluation:${goldenCase.id}`,
    promptVersion
  });
  const replay = await generateMigrationChecklistForContext(context, {
    aiRuntime: replayRuntime(rawOutput, runtimeErrorCode, identity),
    runId: `migration-evaluation:${goldenCase.id}`,
    promptVersion
  });
  const result = compareMigrationEvaluationCase(goldenCase, {
    context,
    generation,
    rawOutput,
    runtimeErrorCode,
    deterministicReplayPassed: canonicalJson(generation) === canonicalJson(replay)
  });
  return { result, observedIdentity };
}

/**
 * Run the migration-specific dataset. Real providers are called only when mode is explicitly `real`.
 * Raw provider payloads and raw error messages are never included in the returned report.
 */
export async function runMigrationEvaluation({
  dataset,
  datasetPath,
  mode = 'fake',
  runtime,
  runtimeMetadata,
  generatedAt,
  promptVersion = MIGRATION_PLANNING_PROMPT_VERSION
} = {}) {
  if (!['fake', 'real'].includes(mode)) {
    throw new TypeError('Migration evaluation mode must be fake or real.');
  }
  if (generatedAt === undefined) {
    throw new TypeError('Migration evaluation requires an injected generatedAt timestamp.');
  }
  if (mode === 'real' && !runtime) {
    throw new TypeError('Real migration evaluation requires an explicitly injected AiRuntime.');
  }
  const loaded = dataset ?? await loadMigrationEvaluationDataset(datasetPath);
  const value = coreDataset(loaded);
  validateMigrationEvaluationDataset(value);
  if (value.task !== MIGRATION_PLANNING_TASK) {
    throw new TypeError(`Migration evaluation dataset task must be ${MIGRATION_PLANNING_TASK}.`);
  }
  const timestamp = isoTimestamp(generatedAt);
  const identity = runtimeIdentity(mode, runtimeMetadata);
  const activeRuntime = runtime ?? createMigrationGoldenFakeRuntime(value);
  const cases = [];
  const observedProviders = new Set();
  const observedModels = new Set();
  for (const goldenCase of [...value.cases].sort((left, right) => compareText(left.id, right.id))) {
    const evaluated = await evaluateCase(goldenCase, activeRuntime, identity, promptVersion);
    cases.push(evaluated.result);
    if (evaluated.observedIdentity.provider) observedProviders.add(evaluated.observedIdentity.provider);
    if (evaluated.observedIdentity.model) observedModels.add(evaluated.observedIdentity.model);
  }
  const observedRuntime = {
    ...identity,
    observedProviders: [...observedProviders].sort(compareText),
    observedModels: [...observedModels].sort(compareText)
  };
  const metrics = computeMigrationEvaluationMetrics(cases);
  const datasetIdentity = {
    datasetId: value.datasetId,
    schemaVersion: value.schemaVersion,
    datasetDigest: migrationEvaluationDatasetDigest(value)
  };
  const qualification = qualifyMigrationPlanningRuntime({
    dataset: datasetIdentity,
    metrics,
    runtime: observedRuntime,
    generatedAt: timestamp,
    promptVersion
  });
  const base = {
    schemaVersion: MIGRATION_EVALUATION_REPORT_VERSION,
    generatedAt: timestamp,
    task: MIGRATION_PLANNING_TASK,
    dataset: datasetIdentity,
    promptVersion,
    runtime: observedRuntime,
    cases,
    metrics,
    qualification
  };
  return deepFreeze({
    ...base,
    scorecard: buildMigrationEvaluationScorecard(base)
  });
}
