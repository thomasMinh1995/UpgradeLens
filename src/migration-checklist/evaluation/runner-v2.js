import { canonicalJson } from '../../canonical-json.js';
import { AiRuntimeError, isAiRuntimeError } from '../../ai-runtime-error.js';
import { compareText } from '../../portable.js';
import { generateMigrationChecklistForContext } from '../generator.js';
import { MIGRATION_PLANNING_PROMPT_VERSION, MIGRATION_PLANNING_TASK } from '../prompt.js';
import { compareMigrationEvaluationCaseV2 } from './comparator-v2.js';
import { buildMigrationEvaluationContext, loadMigrationEvaluationDataset } from './dataset.js';
import {
  loadMigrationEvaluationDatasetV2,
  migrationEvaluationDatasetV2Digest,
  resolveMigrationEvaluationV2Case,
  validateMigrationEvaluationDatasetV2
} from './dataset-v2.js';
import { computeMigrationEvaluationMetricsV2 } from './metrics-v2.js';
import { qualifyMigrationPlanningRuntimeV2 } from './qualification-v2.js';
import { buildMigrationEvaluationScorecardV2 } from './scorecard-v2.js';

export const MIGRATION_EVALUATION_REPORT_V2_VERSION = '2.0.0';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isoTimestamp(value) {
  const timestamp = value instanceof Date ? value.toISOString() : value;
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) {
    throw new TypeError('Migration evaluation v2 requires an injected Date or ISO timestamp.');
  }
  return timestamp;
}

function runtimeIdentity(mode, metadata = {}) {
  const allowed = new Set(['provider', 'model', 'adapter']);
  const unknown = Object.keys(metadata).filter((field) => !allowed.has(field));
  if (unknown.length > 0) {
    throw new TypeError(`Migration evaluation v2 runtime metadata contains unsupported field ${unknown.sort(compareText)[0]}.`);
  }
  const defaults = mode === 'fake' ? {
    provider: 'migration-golden-fake',
    model: '2.0.0',
    adapter: 'role-routed-recorded-runtime'
  } : {};
  const identity = { mode, ...defaults, ...metadata };
  for (const field of allowed) {
    if (typeof identity[field] !== 'string' || identity[field].length === 0) {
      throw new TypeError(`Migration evaluation v2 requires runtimeMetadata.${field}.`);
    }
  }
  return identity;
}

function fixedRuntime(output, runtimeErrorCode, identity) {
  return {
    async generateStructured() {
      if (runtimeErrorCode) {
        throw new AiRuntimeError(runtimeErrorCode, 'Injected sanitized evaluation failure.', {
          retryable: false
        });
      }
      return {
        output: structuredClone(output),
        provider: identity.provider,
        model: identity.model,
        latencyMs: 0
      };
    }
  };
}

async function evaluateCase({
  dataset,
  goldenCase,
  activeRuntime,
  identity,
  promptVersion,
  retainFailureDetails
}) {
  const resolved = resolveMigrationEvaluationV2Case(dataset, goldenCase);
  const context = buildMigrationEvaluationContext(resolved.baseCase);
  const localRuntime = goldenCase.role === 'LIVE_QUALITY'
    ? activeRuntime
    : fixedRuntime(resolved.fixedOutput, resolved.runtimeErrorCode, identity);
  let rawOutput;
  let runtimeErrorCode = null;
  const observedIdentity = {};
  const capturingRuntime = {
    async generateStructured(request) {
      try {
        const response = await localRuntime.generateStructured(request);
        rawOutput = structuredClone(response?.output);
        if (goldenCase.role === 'LIVE_QUALITY') {
          if (typeof response?.provider === 'string') observedIdentity.provider = response.provider;
          if (typeof response?.model === 'string') observedIdentity.model = response.model;
        }
        return response;
      } catch (error) {
        runtimeErrorCode = isAiRuntimeError(error) ? error.code : 'UNKNOWN';
        throw error;
      }
    }
  };
  const generation = await generateMigrationChecklistForContext(context, {
    aiRuntime: capturingRuntime,
    runId: `migration-evaluation-v2:${goldenCase.id}`,
    promptVersion
  });
  const replay = await generateMigrationChecklistForContext(context, {
    aiRuntime: fixedRuntime(rawOutput, runtimeErrorCode, identity),
    runId: `migration-evaluation-v2:${goldenCase.id}`,
    promptVersion
  });
  return {
    result: compareMigrationEvaluationCaseV2(goldenCase, {
      baseCase: resolved.baseCase,
      context,
      generation,
      rawOutput,
      runtimeErrorCode,
      deterministicReplayPassed: canonicalJson(generation) === canonicalJson(replay),
      retainFailureDetails
    }),
    observedIdentity
  };
}

/**
 * Run dataset v2. Only LIVE_QUALITY cases may reach an explicitly injected real runtime.
 * Recorded containment and injected failures always use local deterministic fixtures.
 */
export async function runMigrationEvaluationV2({
  dataset,
  datasetPath,
  mode = 'fake',
  runtime,
  runtimeMetadata,
  generatedAt,
  promptVersion = MIGRATION_PLANNING_PROMPT_VERSION,
  retainFailureDetails = true
} = {}) {
  if (!['fake', 'real'].includes(mode)) {
    throw new TypeError('Migration evaluation v2 mode must be fake or real.');
  }
  if (generatedAt === undefined) {
    throw new TypeError('Migration evaluation v2 requires an injected generatedAt timestamp.');
  }
  if (mode === 'real' && !runtime) {
    throw new TypeError('Real migration evaluation v2 requires an explicitly injected AiRuntime.');
  }
  if (typeof retainFailureDetails !== 'boolean') {
    throw new TypeError('retainFailureDetails must be boolean.');
  }
  const loaded = dataset ? {
    ...structuredClone(dataset),
    legacyDataset: dataset.legacyDataset ?? await loadMigrationEvaluationDataset()
  } : await loadMigrationEvaluationDatasetV2(datasetPath);
  const core = {
    schemaVersion: loaded.schemaVersion,
    datasetId: loaded.datasetId,
    task: loaded.task,
    baseDataset: structuredClone(loaded.baseDataset),
    cases: structuredClone(loaded.cases)
  };
  validateMigrationEvaluationDatasetV2(core, loaded.legacyDataset);
  const timestamp = isoTimestamp(generatedAt);
  const identity = runtimeIdentity(mode, runtimeMetadata);
  let providerRequestCount = 0;
  const liveRuntime = mode === 'real' ? {
    async generateStructured(request) {
      providerRequestCount += 1;
      return runtime.generateStructured(request);
    }
  } : null;
  const cases = [];
  const observedProviders = new Set();
  const observedModels = new Set();
  for (const goldenCase of [...loaded.cases].sort((left, right) => compareText(left.id, right.id))) {
    const resolved = resolveMigrationEvaluationV2Case(loaded, goldenCase);
    const activeRuntime = goldenCase.role === 'LIVE_QUALITY'
      ? (liveRuntime ?? fixedRuntime(resolved.fixedOutput, null, identity))
      : null;
    const evaluated = await evaluateCase({
      dataset: loaded,
      goldenCase,
      activeRuntime,
      identity,
      promptVersion,
      retainFailureDetails
    });
    cases.push(evaluated.result);
    if (evaluated.observedIdentity.provider) observedProviders.add(evaluated.observedIdentity.provider);
    if (evaluated.observedIdentity.model) observedModels.add(evaluated.observedIdentity.model);
  }
  const observedRuntime = {
    ...identity,
    observedProviders: [...observedProviders].sort(compareText),
    observedModels: [...observedModels].sort(compareText)
  };
  const metrics = computeMigrationEvaluationMetricsV2(cases, { providerRequestCount });
  const datasetIdentity = {
    datasetId: core.datasetId,
    schemaVersion: core.schemaVersion,
    datasetDigest: migrationEvaluationDatasetV2Digest(core, loaded.legacyDataset)
  };
  const qualification = qualifyMigrationPlanningRuntimeV2({
    dataset: datasetIdentity,
    metrics,
    runtime: observedRuntime,
    generatedAt: timestamp,
    promptVersion
  });
  const base = {
    schemaVersion: MIGRATION_EVALUATION_REPORT_V2_VERSION,
    generatedAt: timestamp,
    task: MIGRATION_PLANNING_TASK,
    dataset: datasetIdentity,
    promptVersion,
    runtime: observedRuntime,
    cases,
    metrics,
    qualification
  };
  return deepFreeze({ ...base, scorecard: buildMigrationEvaluationScorecardV2(base) });
}
