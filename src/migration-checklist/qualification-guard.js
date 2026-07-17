import { canonicalJson } from '../canonical-json.js';
import { compareText } from '../portable.js';
import {
  MIGRATION_EVALUATION_DATASET_ID,
  MIGRATION_EVALUATION_DATASET_VERSION,
  loadMigrationEvaluationDataset
} from './evaluation/dataset.js';
import {
  MIGRATION_GENERATOR_TRUST_SOURCE_IDENTITY,
  MIGRATION_QUALIFICATION_POLICY_VERSION,
  migrationCandidateSchemaDigest,
  migrationQualificationPolicyDigest
} from './evaluation/qualification.js';
import { MIGRATION_PLANNING_PROMPT_VERSION, MIGRATION_PLANNING_TASK } from './prompt.js';

export const MIGRATION_QUALIFICATION_STATES = Object.freeze([
  'QUALIFIED',
  'QUALIFIED_WITH_LIMITATIONS',
  'EXPERIMENTAL'
]);

export class MigrationQualificationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MigrationQualificationError';
    this.code = code;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function limitation(code, message) {
  return { code, message };
}

function sortedUniqueLimitations(values) {
  const unique = new Map();
  for (const item of values) unique.set(`${item.code}\0${item.message}`, structuredClone(item));
  return [...unique.values()].sort((left, right) => (
    compareText(left.code, right.code) || compareText(left.message, right.message)
  ));
}

function normalizedRuntimeMetadata(runtimeMetadata = {}) {
  return {
    provider: typeof runtimeMetadata.provider === 'string' && runtimeMetadata.provider.length > 0
      ? runtimeMetadata.provider : 'unknown',
    model: typeof runtimeMetadata.model === 'string' && runtimeMetadata.model.length > 0
      ? runtimeMetadata.model : 'unknown',
    adapter: typeof runtimeMetadata.adapter === 'string' && runtimeMetadata.adapter.length > 0
      ? runtimeMetadata.adapter : 'unknown'
  };
}

function identityMatches(actual, expected) {
  if (!actual) return false;
  for (const field of [
    'task', 'datasetId', 'datasetVersion', 'datasetDigest', 'policyVersion', 'policyDigest',
    'promptVersion', 'candidateSchemaDigest'
  ]) {
    if (actual[field] !== expected[field]) return false;
  }
  if (canonicalJson(actual.generatorTrustSourceIdentity) !== canonicalJson(expected.generatorTrustSourceIdentity)) {
    return false;
  }
  return actual.runtime?.mode === 'real'
    && actual.runtime.provider === expected.runtime.provider
    && actual.runtime.model === expected.runtime.model
    && actual.runtime.adapter === expected.runtime.adapter;
}

function experimentalBaseLimitations() {
  return [
    limitation(
      'EXPERIMENTAL_MIGRATION_CHECKLIST',
      'Migration Checklist is experimental and every generated instruction requires human review.'
    ),
    limitation(
      'KNOWN_SEMANTIC_OR_LEXICAL_GAPS',
      'Exact excerpts and lexical trust checks do not prove semantic entailment; known flag and plain-language gaps remain.'
    )
  ];
}

/**
 * Bind a qualification to the exact migration task/runtime identity. Unknown or fake
 * qualification is never promoted; explicit experimental policy may allow a warned run.
 */
export async function evaluateMigrationQualification({
  qualification = null,
  runtimeMetadata,
  allowExperimental = false
} = {}) {
  const runtime = normalizedRuntimeMetadata(runtimeMetadata);
  const dataset = await loadMigrationEvaluationDataset();
  const expectedIdentity = {
    task: MIGRATION_PLANNING_TASK,
    datasetId: MIGRATION_EVALUATION_DATASET_ID,
    datasetVersion: MIGRATION_EVALUATION_DATASET_VERSION,
    datasetDigest: dataset.datasetDigest,
    policyVersion: MIGRATION_QUALIFICATION_POLICY_VERSION,
    policyDigest: migrationQualificationPolicyDigest(),
    promptVersion: MIGRATION_PLANNING_PROMPT_VERSION,
    candidateSchemaDigest: migrationCandidateSchemaDigest(),
    generatorTrustSourceIdentity: MIGRATION_GENERATOR_TRUST_SOURCE_IDENTITY,
    runtime: { mode: 'real', ...runtime }
  };

  if (qualification?.verdict === 'NOT_QUALIFIED') {
    throw new MigrationQualificationError(
      'MIGRATION_RUNTIME_NOT_QUALIFIED',
      'The configured provider/model failed a critical migration-planning qualification gate.'
    );
  }

  const matches = identityMatches(qualification?.identity, expectedIdentity);
  const realQualified = matches && ['QUALIFIED', 'QUALIFIED_WITH_LIMITATIONS'].includes(
    qualification?.verdict
  );
  if (realQualified) {
    return deepFreeze({
      state: qualification.verdict,
      qualificationId: qualification.qualificationId,
      identity: expectedIdentity,
      limitations: sortedUniqueLimitations([
        ...experimentalBaseLimitations(),
        ...(qualification.limitations ?? []).map(({ code, message }) => ({ code, message }))
      ])
    });
  }

  if (!allowExperimental) {
    throw new MigrationQualificationError(
      'MIGRATION_QUALIFICATION_REQUIRED',
      'A matching real-provider qualification is required for migration-planning.v1.'
    );
  }

  const limitations = experimentalBaseLimitations();
  if (!qualification) {
    limitations.push(limitation(
      'MIGRATION_PROVIDER_NOT_QUALIFIED',
      'The configured provider/model has not been qualified for migration-planning.v1.'
    ));
  } else if (qualification.identity?.runtime?.mode === 'fake') {
    limitations.push(limitation(
      'FAKE_QUALIFICATION_NOT_REAL_PROVIDER',
      'Fake-runtime qualification does not qualify the configured real provider/model.'
    ));
  } else if (!matches) {
    limitations.push(limitation(
      'MIGRATION_QUALIFICATION_IDENTITY_MISMATCH',
      'Available qualification does not match the current task, provider, model, adapter, dataset, prompt, schema, or policy identity.'
    ));
  } else {
    limitations.push(limitation(
      'MIGRATION_QUALIFICATION_INSUFFICIENT',
      'Available real-provider qualification evidence is incomplete.'
    ));
  }
  if (Object.values(runtime).includes('unknown')) {
    limitations.push(limitation(
      'MIGRATION_RUNTIME_IDENTITY_INCOMPLETE',
      'Provider, model, or runtime adapter metadata is incomplete; this run cannot establish qualification identity.'
    ));
  }
  return deepFreeze({
    state: 'EXPERIMENTAL',
    qualificationId: null,
    identity: expectedIdentity,
    limitations: sortedUniqueLimitations(limitations)
  });
}
