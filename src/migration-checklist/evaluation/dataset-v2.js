import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

import { AI_RUNTIME_ERROR_CODES } from '../../ai-runtime-error.js';
import { canonicalJson, canonicalJsonBytes } from '../../canonical-json.js';
import { compareText } from '../../portable.js';
import { validateMigrationChecklistCandidate } from '../ai-candidate.js';
import { MIGRATION_PLANNING_TASK } from '../prompt.js';
import { validateMigrationActionCriteria } from './action-criteria.js';
import {
  buildMigrationPolicyProbeCandidate,
  loadMigrationEvaluationDataset,
  migrationEvaluationDatasetDigest
} from './dataset.js';

export const MIGRATION_EVALUATION_DATASET_V2_VERSION = '2.0.0';
export const DEFAULT_MIGRATION_EVALUATION_DATASET_V2_PATH = 'eval/migration-planning/golden-dataset-v2.json';
export const MIGRATION_EVALUATION_FIXTURE_ROLES = Object.freeze([
  'LIVE_QUALITY',
  'RECORDED_CONTAINMENT',
  'INJECTED_FAILURE'
]);

const BUNDLED_PATH = fileURLToPath(
  new URL('../../../eval/migration-planning/golden-dataset-v2.json', import.meta.url)
);
const schema = JSON.parse(await readFile(
  new URL('../../../schemas/migration-evaluation-dataset-v2.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

function datasetError(message) {
  return new Error(`Migration Evaluation Dataset v2 error: ${message}`);
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function duplicate(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))]
    .sort(compareText);
}

function assertRoleFields(item) {
  const fieldsByRole = {
    LIVE_QUALITY: ['id', 'role', 'baseCaseId', 'fakeResponseSource', 'expected'],
    RECORDED_CONTAINMENT: ['id', 'role', 'baseCaseId', 'recordedSource', 'recordedExpected'],
    INJECTED_FAILURE: ['id', 'role', 'baseCaseId', 'injectedFailure', 'injectedExpected']
  };
  const expected = fieldsByRole[item.role];
  if (!expected || !same(Object.keys(item).sort(compareText), [...expected].sort(compareText))) {
    throw datasetError(`${item.id} contains fields incompatible with role ${item.role}.`);
  }
}

function baseCaseMap(baseDataset) {
  return new Map(baseDataset.cases.map((item) => [item.id, item]));
}

function resolveRecordedCandidate(item, baseCase) {
  if (item.recordedSource.kind === 'BASE_RESPONSE') {
    if (baseCase.response.kind !== 'candidate') {
      throw datasetError(`${item.id} BASE_RESPONSE is not a candidate.`);
    }
    return baseCase.response.candidate;
  }
  if (item.recordedSource.kind === 'CUSTOM_CANDIDATE') {
    return item.recordedSource.candidate;
  }
  const probe = baseCase.policyProbes.find((value) => value.id === item.recordedSource.probeId);
  if (!probe) throw datasetError(`${item.id} references unknown base policy probe ${item.recordedSource.probeId}.`);
  return buildMigrationPolicyProbeCandidate(probe);
}

function validateBaseIdentity(dataset, baseDataset) {
  if (dataset.baseDataset.datasetId !== baseDataset.datasetId
      || dataset.baseDataset.version !== baseDataset.schemaVersion
      || dataset.baseDataset.digest !== migrationEvaluationDatasetDigest({
        schemaVersion: baseDataset.schemaVersion,
        datasetId: baseDataset.datasetId,
        task: baseDataset.task,
        cases: structuredClone(baseDataset.cases)
      })) {
    throw datasetError('base dataset identity or digest does not match immutable v1.');
  }
}

function validateTextSafety(dataset) {
  const serialized = canonicalJson(dataset);
  if (/\/(?:Users|home|private\/tmp)\//.test(serialized)
      || /(?:api[_-]?key|authorization|bearer\s+[a-z0-9._-]+)/i.test(serialized)) {
    throw datasetError('dataset contains a private path or secret-like field.');
  }
}

export function validateMigrationEvaluationDatasetV2(dataset, baseDataset) {
  if (dataset?.schemaVersion !== MIGRATION_EVALUATION_DATASET_V2_VERSION) {
    throw datasetError(`unsupported schema version; expected ${MIGRATION_EVALUATION_DATASET_V2_VERSION}.`);
  }
  if (!baseDataset || baseDataset.schemaVersion !== '1.0.0') {
    throw datasetError('immutable v1 base dataset is required for validation.');
  }
  if (!validateSchema(dataset)) {
    throw datasetError(`schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  if (dataset.task !== MIGRATION_PLANNING_TASK) {
    throw datasetError(`task must be ${MIGRATION_PLANNING_TASK}.`);
  }
  validateBaseIdentity(dataset, baseDataset);
  validateTextSafety(dataset);
  const ids = dataset.cases.map((item) => item.id);
  const duplicates = duplicate(ids);
  if (duplicates.length > 0) throw datasetError(`duplicate case id ${duplicates[0]}.`);
  if (!same(ids, [...ids].sort(compareText))) throw datasetError('cases must use stable lexical ordering by id.');
  const byBaseId = baseCaseMap(baseDataset);
  for (const item of dataset.cases) {
    assertRoleFields(item);
    const baseCase = byBaseId.get(item.baseCaseId);
    if (!baseCase) throw datasetError(`${item.id} references unknown base case ${item.baseCaseId}.`);
    if (item.role === 'LIVE_QUALITY') {
      if (baseCase.response.kind !== 'candidate') {
        throw datasetError(`${item.id} LIVE_QUALITY requires a safe candidate/abstention fake response.`);
      }
      validateMigrationActionCriteria(item.expected.actionCriteria);
      if (item.expected.actionExpected !== (item.expected.actionCriteria.actions.length > 0)) {
        throw datasetError(`${item.id} actionExpected is inconsistent with action criteria.`);
      }
      if (item.expected.actionExpected !== baseCase.expected.actionExpected) {
        throw datasetError(`${item.id} changes the base case action intention.`);
      }
      validateMigrationChecklistCandidate(baseCase.response.candidate);
    } else if (item.role === 'RECORDED_CONTAINMENT') {
      validateMigrationChecklistCandidate(resolveRecordedCandidate(item, baseCase));
      if (item.recordedExpected.unsafe === false
          && !item.recordedExpected.coverage.includes('SAFE_CANDIDATE')) {
        throw datasetError(`${item.id} safe recorded fixture must declare SAFE_CANDIDATE coverage.`);
      }
    } else {
      if (item.injectedFailure.kind === 'RUNTIME_ERROR'
          && !AI_RUNTIME_ERROR_CODES.includes(item.injectedFailure.code)) {
        throw datasetError(`${item.id} uses unknown runtime error code ${item.injectedFailure.code}.`);
      }
      const expectedOutcome = item.injectedFailure.kind === 'RUNTIME_ERROR' ? 'failed' : 'rejected';
      if (item.injectedExpected.finalOutcome !== expectedOutcome) {
        throw datasetError(`${item.id} injected failure outcome is inconsistent.`);
      }
    }
  }
  const roleCounts = Object.fromEntries(MIGRATION_EVALUATION_FIXTURE_ROLES.map((role) => [
    role, dataset.cases.filter((item) => item.role === role).length
  ]));
  const liveCases = dataset.cases.filter((item) => item.role === 'LIVE_QUALITY');
  const liveEcosystems = new Set(liveCases.map((item) => byBaseId.get(item.baseCaseId).ecosystem));
  if (roleCounts.LIVE_QUALITY < 7 || roleCounts.RECORDED_CONTAINMENT < 1
      || roleCounts.INJECTED_FAILURE < 3
      || !['generic', 'node', 'python'].every((value) => liveEcosystems.has(value))) {
    throw datasetError('dataset has insufficient role or live ecosystem coverage.');
  }
  return dataset;
}

export function migrationEvaluationDatasetV2Digest(dataset, baseDataset) {
  validateMigrationEvaluationDatasetV2(dataset, baseDataset);
  return digest(dataset);
}

export async function loadMigrationEvaluationDatasetV2(datasetPath) {
  const [baseDataset, source] = await Promise.all([
    loadMigrationEvaluationDataset(),
    readFile(datasetPath ?? BUNDLED_PATH, 'utf8')
  ]);
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw datasetError(`${datasetPath ?? BUNDLED_PATH} is not valid JSON.`);
  }
  validateMigrationEvaluationDatasetV2(parsed, baseDataset);
  return deepFreeze({
    datasetPath: path.resolve(datasetPath ?? BUNDLED_PATH),
    datasetDigest: migrationEvaluationDatasetV2Digest(parsed, baseDataset),
    ...structuredClone(parsed),
    legacyDataset: baseDataset
  });
}

export async function loadVersionedMigrationEvaluationDataset({ version = '1.0.0', datasetPath } = {}) {
  if (version === '1.0.0') return loadMigrationEvaluationDataset(datasetPath);
  if (version === MIGRATION_EVALUATION_DATASET_V2_VERSION) {
    return loadMigrationEvaluationDatasetV2(datasetPath);
  }
  throw datasetError(`unsupported requested version ${version}.`);
}

export function resolveMigrationEvaluationV2Case(dataset, item) {
  const baseCase = dataset.legacyDataset.cases.find((value) => value.id === item.baseCaseId);
  if (!baseCase) throw datasetError(`${item.id} cannot resolve base case ${item.baseCaseId}.`);
  let fixedOutput = null;
  let runtimeErrorCode = null;
  if (item.role === 'LIVE_QUALITY') {
    fixedOutput = structuredClone(baseCase.response.candidate);
  } else if (item.role === 'RECORDED_CONTAINMENT') {
    fixedOutput = structuredClone(resolveRecordedCandidate(item, baseCase));
  } else if (item.injectedFailure.kind === 'RUNTIME_ERROR') {
    runtimeErrorCode = item.injectedFailure.code;
  } else {
    fixedOutput = structuredClone(item.injectedFailure.output);
  }
  return deepFreeze({ baseCase, fixedOutput, runtimeErrorCode });
}
