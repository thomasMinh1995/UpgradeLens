import { createHash } from 'node:crypto';

import { canonicalJson, canonicalJsonBytes } from '../canonical-json.js';
import { compareText } from '../portable.js';
import {
  loadMigrationEvaluationDatasetV2
} from './evaluation/dataset-v2.js';
import {
  migrationActionEvaluationCriteriaDigest,
  migrationActionEvaluationCriteriaIdentity
} from './evaluation/action-criteria.js';
import {
  MIGRATION_EXTRACTIVE_GENERATOR_TRUST_SOURCE_IDENTITY,
  MIGRATION_EXTRACTIVE_QUALIFICATION_POLICY_V2_VERSION,
  migrationExtractiveQualificationPolicyV2Digest
} from './evaluation/qualification-v2.js';
import {
  MIGRATION_EXTRACTIVE_PRESENTATION,
  migrationExtractiveCandidateSchemaDigest
} from './extractive-candidate.js';
import {
  MIGRATION_EXTRACTIVE_PLANNING_TASK,
  MIGRATION_EXTRACTIVE_PROMPT_VERSION,
  migrationExtractivePromptDigest
} from './extractive-prompt.js';

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
    'task', 'datasetId', 'datasetVersion', 'datasetDigest',
    'evaluationCriteriaId', 'evaluationCriteriaVersion', 'evaluationCriteriaDigest',
    'comparatorVersion', 'normalizationVersion',
    'policyVersion', 'policyDigest', 'promptVersion', 'promptDigest',
    'candidateSchemaDigest', 'deterministicPresentationIdentity'
  ]) {
    if (actual[field] !== expected[field]) return false;
  }
  if (canonicalJson(actual.generatorTrustSourceIdentity) !== canonicalJson(expected.generatorTrustSourceIdentity)) {
    return false;
  }
  return actual.runtime?.mode === 'real'
    && actual.runtime.provider === expected.runtime.provider
    && actual.runtime.model === expected.runtime.model
    && actual.runtime.adapter === expected.runtime.adapter
    && canonicalJson(actual.runtime.observedProviders)
      === canonicalJson(expected.runtime.observedProviders)
    && canonicalJson(actual.runtime.observedModels)
      === canonicalJson(expected.runtime.observedModels);
}

function qualificationIdentityDigest(identity) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(identity)).digest('hex')}`;
}

function experimentalBaseLimitations() {
  return [
    limitation(
      'EXPERIMENTAL_MIGRATION_CHECKLIST',
      'Migration Checklist is experimental and every generated instruction requires human review.'
    ),
    limitation(
      'EXTRACTIVE_SEMANTIC_APPLICABILITY_NOT_VERIFIED',
      'Exact selected guidance proves provenance and structural safety, not semantic applicability to this repository.'
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
  const dataset = await loadMigrationEvaluationDatasetV2();
  const criteria = migrationActionEvaluationCriteriaIdentity();
  const expectedIdentity = {
    task: MIGRATION_EXTRACTIVE_PLANNING_TASK,
    datasetId: dataset.datasetId,
    datasetVersion: dataset.schemaVersion,
    datasetDigest: dataset.datasetDigest,
    evaluationCriteriaId: criteria.evaluationCriteriaId,
    evaluationCriteriaVersion: criteria.evaluationCriteriaVersion,
    evaluationCriteriaDigest: migrationActionEvaluationCriteriaDigest(),
    comparatorVersion: criteria.comparatorVersion,
    normalizationVersion: criteria.normalizationVersion,
    policyVersion: MIGRATION_EXTRACTIVE_QUALIFICATION_POLICY_V2_VERSION,
    policyDigest: migrationExtractiveQualificationPolicyV2Digest(),
    promptVersion: MIGRATION_EXTRACTIVE_PROMPT_VERSION,
    promptDigest: migrationExtractivePromptDigest(),
    candidateSchemaDigest: migrationExtractiveCandidateSchemaDigest(),
    generatorTrustSourceIdentity: MIGRATION_EXTRACTIVE_GENERATOR_TRUST_SOURCE_IDENTITY,
    deterministicPresentationIdentity: MIGRATION_EXTRACTIVE_PRESENTATION,
    runtime: {
      mode: 'real',
      ...runtime,
      observedProviders: [runtime.provider],
      observedModels: [runtime.model]
    }
  };

  const matches = identityMatches(qualification?.identity, expectedIdentity);
  if (matches && qualification.qualificationId !== qualificationIdentityDigest(
    qualification.identity
  )) {
    throw new MigrationQualificationError(
      'MIGRATION_QUALIFICATION_IDENTITY_CORRUPT',
      'The matching migration-planning.v2 qualification identity digest is invalid.'
    );
  }
  if (matches && qualification?.verdict === 'NOT_QUALIFIED') {
    throw new MigrationQualificationError(
      'MIGRATION_RUNTIME_NOT_QUALIFIED',
      'The configured provider/model failed a critical migration-planning qualification gate.'
    );
  }

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
      'A matching real-provider qualification is required for migration-planning.v2.'
    );
  }

  const limitations = experimentalBaseLimitations();
  if (!qualification) {
    limitations.push(limitation(
      'MIGRATION_PROVIDER_NOT_QUALIFIED',
      'The configured provider/model has not been qualified for migration-planning.v2.'
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
