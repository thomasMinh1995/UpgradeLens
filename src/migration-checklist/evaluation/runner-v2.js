import { canonicalJson } from '../../canonical-json.js';
import { AiRuntimeError, isAiRuntimeError } from '../../ai-runtime-error.js';
import { compareText } from '../../portable.js';
import {
  generateMigrationChecklistForContext,
  generateMigrationExtractiveChecklistForContext
} from '../generator.js';
import {
  MIGRATION_EXTRACTIVE_PLANNING_TASK,
  MIGRATION_EXTRACTIVE_PROMPT_VERSION
} from '../extractive-prompt.js';
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
import {
  qualifyMigrationExtractiveRuntimeV2,
  qualifyMigrationPlanningRuntimeV2
} from './qualification-v2.js';
import { buildMigrationEvaluationScorecardV2 } from './scorecard-v2.js';
import {
  classifyMigrationExtractiveOutput,
  resolveMigrationExtractiveEvaluationV2Case
} from './extractive-fixtures-v2.js';

export const MIGRATION_EVALUATION_REPORT_V2_VERSION = '2.0.0';
export const MIGRATION_EXTRACTIVE_EVALUATION_REPORT_V2_VERSION = '2.0.0-extractive';

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

function runtimeIdentity(mode, metadata = {}, fakeDefaults) {
  const allowed = new Set(['provider', 'model', 'adapter']);
  const unknown = Object.keys(metadata).filter((field) => !allowed.has(field));
  if (unknown.length > 0) {
    throw new TypeError(`Migration evaluation v2 runtime metadata contains unsupported field ${unknown.sort(compareText)[0]}.`);
  }
  const defaults = mode === 'fake' ? (fakeDefaults ?? {
    provider: 'migration-golden-fake',
    model: '2.0.0',
    adapter: 'role-routed-recorded-runtime'
  }) : {};
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
  retainFailureDetails,
  strategy
}) {
  const resolved = strategy.resolveCase(dataset, goldenCase);
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
  const generation = await strategy.generateContext(context, {
    aiRuntime: capturingRuntime,
    runId: `migration-evaluation-v2:${goldenCase.id}`,
    promptVersion
  });
  const replay = await strategy.generateContext(context, {
    aiRuntime: fixedRuntime(rawOutput, runtimeErrorCode, identity),
    runId: `migration-evaluation-v2:${goldenCase.id}`,
    promptVersion
  });
  const rawClassification = strategy.classifyRawOutput
    ? strategy.classifyRawOutput(rawOutput, context, runtimeErrorCode)
    : null;
  return {
    result: compareMigrationEvaluationCaseV2(goldenCase, {
      baseCase: resolved.baseCase,
      context,
      generation,
      rawOutput,
      runtimeErrorCode,
      rawClassification,
      publishedEvaluationInstructions:
        strategy.evaluatePublishedSupportFromSelectedSpans
        && rawClassification?.outcome === 'ACTIONABLE'
          ? rawClassification.candidate.items.map((item) => item.instruction)
          : null,
      deterministicReplayPassed: canonicalJson(generation) === canonicalJson(replay),
      retainFailureDetails
    }),
    observedIdentity
  };
}

const FREE_FORM_STRATEGY = Object.freeze({
  task: MIGRATION_PLANNING_TASK,
  reportVersion: MIGRATION_EVALUATION_REPORT_V2_VERSION,
  defaultPromptVersion: MIGRATION_PLANNING_PROMPT_VERSION,
  fakeRuntime: {
    provider: 'migration-golden-fake',
    model: '2.0.0',
    adapter: 'role-routed-recorded-runtime'
  },
  resolveCase: resolveMigrationEvaluationV2Case,
  generateContext: generateMigrationChecklistForContext,
  classifyRawOutput: null,
  qualify: qualifyMigrationPlanningRuntimeV2
});

const EXTRACTIVE_STRATEGY = Object.freeze({
  task: MIGRATION_EXTRACTIVE_PLANNING_TASK,
  reportVersion: MIGRATION_EXTRACTIVE_EVALUATION_REPORT_V2_VERSION,
  defaultPromptVersion: MIGRATION_EXTRACTIVE_PROMPT_VERSION,
  fakeRuntime: {
    provider: 'migration-extractive-golden-fake',
    model: '2.0.0',
    adapter: 'extractive-role-routed-recorded-runtime'
  },
  resolveCase: resolveMigrationExtractiveEvaluationV2Case,
  generateContext: generateMigrationExtractiveChecklistForContext,
  classifyRawOutput: classifyMigrationExtractiveOutput,
  evaluatePublishedSupportFromSelectedSpans: true,
  qualify: qualifyMigrationExtractiveRuntimeV2
});

async function runMigrationEvaluationV2WithStrategy({
  dataset,
  datasetPath,
  mode = 'fake',
  runtime,
  runtimeMetadata,
  generatedAt,
  promptVersion,
  retainFailureDetails = true
}, strategy) {
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
  const activePromptVersion = promptVersion ?? strategy.defaultPromptVersion;
  const identity = runtimeIdentity(mode, runtimeMetadata, strategy.fakeRuntime);
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
    const resolved = strategy.resolveCase(loaded, goldenCase);
    const activeRuntime = goldenCase.role === 'LIVE_QUALITY'
      ? (liveRuntime ?? fixedRuntime(resolved.fixedOutput, null, identity))
      : null;
    const evaluated = await evaluateCase({
      dataset: loaded,
      goldenCase,
      activeRuntime,
      identity,
      promptVersion: activePromptVersion,
      retainFailureDetails,
      strategy
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
  const qualification = strategy.qualify({
    dataset: datasetIdentity,
    metrics,
    runtime: observedRuntime,
    generatedAt: timestamp,
    promptVersion: activePromptVersion
  });
  const base = {
    schemaVersion: strategy.reportVersion,
    generatedAt: timestamp,
    task: strategy.task,
    dataset: datasetIdentity,
    promptVersion: activePromptVersion,
    runtime: observedRuntime,
    cases,
    metrics,
    qualification
  };
  return deepFreeze({ ...base, scorecard: buildMigrationEvaluationScorecardV2(base) });
}

/**
 * Historical free-form v2 evaluation. Retained byte-for-byte in identity and behavior.
 */
export async function runMigrationEvaluationV2(options = {}) {
  return runMigrationEvaluationV2WithStrategy(options, FREE_FORM_STRATEGY);
}

/**
 * Offline-first production extractive evaluation. Recorded containment and injected
 * failures always remain local; only LIVE_QUALITY may reach an explicitly injected runtime.
 */
export async function runMigrationExtractiveEvaluationV2(options = {}) {
  return runMigrationEvaluationV2WithStrategy(options, EXTRACTIVE_STRATEGY);
}
