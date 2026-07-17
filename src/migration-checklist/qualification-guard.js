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
import {
  buildMigrationPlanningQualificationRecord
} from './qualification-store.js';

export const MIGRATION_QUALIFICATION_STATES = Object.freeze([
  'QUALIFIED',
  'QUALIFIED_WITH_LIMITATIONS',
  'NOT_QUALIFIED',
  'MISSING',
  'IDENTITY_MISMATCH',
  'CORRUPTED',
  'INSUFFICIENT_EVIDENCE'
]);

export class MigrationQualificationError extends Error {
  constructor(code, message, decision = null) {
    super(message);
    this.name = 'MigrationQualificationError';
    this.code = code;
    this.decision = decision;
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

export function normalizedMigrationRuntimeMetadata(runtimeMetadata = {}) {
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

export function migrationQualificationIdentityDigest(identity) {
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

async function expectedQualificationIdentity(runtimeMetadata) {
  const runtime = normalizedMigrationRuntimeMetadata(runtimeMetadata);
  const dataset = await loadMigrationEvaluationDatasetV2();
  const criteria = migrationActionEvaluationCriteriaIdentity();
  return {
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
}

function qualificationDecision({
  status,
  reasonCode,
  executionAllowed,
  experimentalOverrideUsed,
  qualificationId,
  identity,
  runtimeIdentity,
  recordRuntimeIdentity = null,
  sourceKind,
  sourcePath = null,
  limitations,
  nextAction
}) {
  return deepFreeze({
    status,
    state: status,
    reasonCode,
    executionAllowed,
    experimentalOverrideUsed,
    qualificationId,
    task: MIGRATION_EXTRACTIVE_PLANNING_TASK,
    identity,
    runtimeIdentity: structuredClone(runtimeIdentity),
    recordRuntimeIdentity: recordRuntimeIdentity
      ? {
          provider: recordRuntimeIdentity.provider,
          model: recordRuntimeIdentity.model,
          adapter: recordRuntimeIdentity.adapter
        }
      : null,
    sourceKind,
    sourcePath,
    limitations: sortedUniqueLimitations(limitations),
    nextAction
  });
}

function blockedMessage(decision) {
  if (decision.status === 'NOT_QUALIFIED') {
    return 'The matching provider/model failed a critical migration-planning.v2 qualification gate.';
  }
  if (decision.status === 'IDENTITY_MISMATCH') {
    return 'The persisted Migration Planning qualification does not match the current runtime identity.';
  }
  if (decision.status === 'CORRUPTED') {
    return 'The selected Migration Planning qualification source failed schema or integrity validation.';
  }
  if (decision.status === 'INSUFFICIENT_EVIDENCE') {
    return 'The matching Migration Planning qualification has insufficient evidence for execution.';
  }
  return 'A matching real-provider qualification is required for migration-planning.v2.';
}

export function migrationQualificationErrorForDecision(decision) {
  return new MigrationQualificationError(
    decision.reasonCode,
    blockedMessage(decision),
    decision
  );
}

export async function createMigrationQualificationSourceFailureDecision({
  status,
  reasonCode,
  runtimeMetadata,
  sourceKind,
  sourcePath = null,
  limitationCode,
  limitationMessage,
  nextAction
}) {
  const identity = await expectedQualificationIdentity(runtimeMetadata);
  return qualificationDecision({
    status,
    reasonCode,
    executionAllowed: false,
    experimentalOverrideUsed: false,
    qualificationId: null,
    identity,
    runtimeIdentity: identity.runtime,
    sourceKind,
    sourcePath,
    limitations: [
      ...experimentalBaseLimitations(),
      limitation(limitationCode, limitationMessage)
    ],
    nextAction
  });
}

/**
 * Produce one immutable source-of-truth decision for the exact migration task/runtime identity.
 * Only a missing record may use the explicit experimental execution exception.
 */
export async function decideMigrationQualification({
  qualification = null,
  runtimeMetadata,
  allowExperimental = false,
  sourceKind = qualification ? 'injected' : 'none',
  sourcePath = null
} = {}) {
  const expectedIdentity = await expectedQualificationIdentity(runtimeMetadata);
  const runtime = expectedIdentity.runtime;

  let identityDigestValid = !qualification;
  if (qualification) {
    try {
      identityDigestValid = qualification.qualificationId
        === migrationQualificationIdentityDigest(qualification.identity);
    } catch {
      identityDigestValid = false;
    }
  }
  if (!identityDigestValid) {
    return qualificationDecision({
      status: 'CORRUPTED',
      reasonCode: 'MIGRATION_QUALIFICATION_IDENTITY_CORRUPT',
      executionAllowed: false,
      experimentalOverrideUsed: false,
      qualificationId: null,
      identity: expectedIdentity,
      runtimeIdentity: runtime,
      recordRuntimeIdentity: qualification.identity?.runtime,
      sourceKind,
      sourcePath,
      limitations: [
        ...experimentalBaseLimitations(),
        limitation(
          'MIGRATION_QUALIFICATION_IDENTITY_CORRUPT',
          'The Migration Planning qualification identity digest is invalid.'
        )
      ],
      nextAction: 'REPLACE_QUALIFICATION_RECORD'
    });
  }
  if (qualification) {
    try {
      qualification = buildMigrationPlanningQualificationRecord(qualification).qualification;
    } catch (error) {
      return qualificationDecision({
        status: 'CORRUPTED',
        reasonCode: error?.code ?? 'MIGRATION_QUALIFICATION_RECORD_INVALID',
        executionAllowed: false,
        experimentalOverrideUsed: false,
        qualificationId: null,
        identity: expectedIdentity,
        runtimeIdentity: runtime,
        recordRuntimeIdentity: qualification.identity?.runtime,
        sourceKind,
        sourcePath,
        limitations: [
          ...experimentalBaseLimitations(),
          limitation(
            error?.code ?? 'MIGRATION_QUALIFICATION_RECORD_INVALID',
            'The Migration Planning qualification failed strict schema or invariant validation.'
          )
        ],
        nextAction: 'REPLACE_QUALIFICATION_RECORD'
      });
    }
  }

  const matches = identityMatches(qualification?.identity, expectedIdentity);
  if (matches && qualification?.verdict === 'NOT_QUALIFIED') {
    return qualificationDecision({
      status: 'NOT_QUALIFIED',
      reasonCode: 'MIGRATION_RUNTIME_NOT_QUALIFIED',
      executionAllowed: false,
      experimentalOverrideUsed: false,
      qualificationId: qualification.qualificationId,
      identity: expectedIdentity,
      runtimeIdentity: runtime,
      recordRuntimeIdentity: qualification.identity.runtime,
      sourceKind,
      sourcePath,
      limitations: [
        ...experimentalBaseLimitations(),
        ...(qualification.limitations ?? []).map(({ code, message }) => ({ code, message })),
        limitation(
          'MIGRATION_RUNTIME_NOT_QUALIFIED',
          'The matching provider/model failed a critical migration-planning.v2 qualification gate.'
        )
      ],
      nextAction: 'REQUALIFY_RUNTIME'
    });
  }
  if (matches && qualification?.verdict === 'INSUFFICIENT_EVIDENCE') {
    return qualificationDecision({
      status: 'INSUFFICIENT_EVIDENCE',
      reasonCode: 'MIGRATION_QUALIFICATION_INSUFFICIENT',
      executionAllowed: false,
      experimentalOverrideUsed: false,
      qualificationId: qualification.qualificationId,
      identity: expectedIdentity,
      runtimeIdentity: runtime,
      recordRuntimeIdentity: qualification.identity.runtime,
      sourceKind,
      sourcePath,
      limitations: [
        ...experimentalBaseLimitations(),
        ...(qualification.limitations ?? []).map(({ code, message }) => ({ code, message })),
        limitation(
          'MIGRATION_QUALIFICATION_INSUFFICIENT',
          'The matching qualification has insufficient real-provider evidence.'
        )
      ],
      nextAction: 'REQUALIFY_RUNTIME'
    });
  }

  const realQualified = matches && ['QUALIFIED', 'QUALIFIED_WITH_LIMITATIONS'].includes(
    qualification?.verdict
  );
  if (realQualified) {
    return qualificationDecision({
      status: qualification.verdict,
      reasonCode: 'MIGRATION_QUALIFICATION_MATCHED',
      executionAllowed: true,
      experimentalOverrideUsed: false,
      qualificationId: qualification.qualificationId,
      identity: expectedIdentity,
      runtimeIdentity: runtime,
      recordRuntimeIdentity: qualification.identity.runtime,
      sourceKind,
      sourcePath,
      limitations: sortedUniqueLimitations([
        ...experimentalBaseLimitations(),
        ...(qualification.limitations ?? []).map(({ code, message }) => ({ code, message }))
      ]),
      nextAction: 'NONE'
    });
  }

  const limitations = experimentalBaseLimitations();
  if (!qualification) {
    limitations.push(limitation(
      'MIGRATION_PROVIDER_NOT_QUALIFIED',
      'The configured provider/model has not been qualified for migration-planning.v2.'
    ));
    if (Object.values(normalizedMigrationRuntimeMetadata(runtimeMetadata)).includes('unknown')) {
      limitations.push(limitation(
        'MIGRATION_RUNTIME_IDENTITY_INCOMPLETE',
        'Provider, model, or runtime adapter metadata is incomplete; this run cannot establish qualification identity.'
      ));
    }
    return qualificationDecision({
      status: 'MISSING',
      reasonCode: allowExperimental
        ? 'MIGRATION_QUALIFICATION_MISSING_EXPERIMENTAL_OVERRIDE'
        : 'MIGRATION_QUALIFICATION_REQUIRED',
      executionAllowed: allowExperimental,
      experimentalOverrideUsed: allowExperimental,
      qualificationId: null,
      identity: expectedIdentity,
      runtimeIdentity: runtime,
      sourceKind,
      sourcePath,
      limitations,
      nextAction: allowExperimental
        ? 'INSTALL_QUALIFICATION_RECORD_OR_REVIEW_EXPERIMENTAL_OUTPUT'
        : 'INSTALL_QUALIFICATION_RECORD'
    });
  }

  if (qualification.identity?.runtime?.mode === 'fake') {
    limitations.push(limitation(
      'FAKE_QUALIFICATION_NOT_REAL_PROVIDER',
      'Fake-runtime qualification does not qualify the configured real provider/model.'
    ));
    return qualificationDecision({
      status: 'IDENTITY_MISMATCH',
      reasonCode: 'MIGRATION_FAKE_QUALIFICATION_FOR_REAL_RUNTIME',
      executionAllowed: false,
      experimentalOverrideUsed: false,
      qualificationId: qualification.qualificationId ?? null,
      identity: expectedIdentity,
      runtimeIdentity: runtime,
      recordRuntimeIdentity: qualification.identity.runtime,
      sourceKind,
      sourcePath,
      limitations,
      nextAction: 'INSTALL_MATCHING_REAL_QUALIFICATION_RECORD'
    });
  }

  limitations.push(limitation(
    'MIGRATION_QUALIFICATION_IDENTITY_MISMATCH',
    'The qualification does not match the current task, provider, model, adapter, dataset, prompt, schema, or policy identity.'
  ));
  return qualificationDecision({
    status: 'IDENTITY_MISMATCH',
    reasonCode: 'MIGRATION_QUALIFICATION_IDENTITY_MISMATCH',
    executionAllowed: false,
    experimentalOverrideUsed: false,
    qualificationId: qualification.qualificationId ?? null,
    identity: expectedIdentity,
    runtimeIdentity: runtime,
    recordRuntimeIdentity: qualification.identity?.runtime,
    sourceKind,
    sourcePath,
    limitations,
    nextAction: 'INSTALL_MATCHING_QUALIFICATION_RECORD'
  });
}

/**
 * Backward-compatible guard API: allowed decisions are returned; blocked decisions remain errors.
 */
export async function evaluateMigrationQualification(options = {}) {
  const decision = await decideMigrationQualification(options);
  if (!decision.executionAllowed) throw migrationQualificationErrorForDecision(decision);
  return decision;
}
