import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';

import { canonicalJsonBytes } from '../canonical-json.js';
import { compareText } from '../portable.js';
import {
  MigrationChecklistTrustError,
  validateMigrationChecklistInstructionTrust
} from './ai-candidate.js';

export const MIGRATION_EXTRACTIVE_CANDIDATE_CONTRACT =
  'migration-checklist-extractive-candidate.v2';
export const MIGRATION_EXTRACTIVE_TRUST_POLICY =
  'migration-checklist-trust.extractive.v2';
export const MIGRATION_EXTRACTIVE_PRESENTATION =
  'migration-checklist-extractive-presentation.v1';
export const MIGRATION_EXTRACTIVE_PRESENTATION_PREFIX =
  'Review this selected official migration guidance (human review required): ';
export const MIGRATION_EXTRACTIVE_CANDIDATE_ERROR_CODES = Object.freeze([
  'OUTPUT_JSON_INVALID',
  'OUTPUT_SCHEMA_INVALID',
  'OUTPUT_SEMANTICS_INVALID'
]);

export const MIGRATION_EXTRACTIVE_CANDIDATE_SCHEMA = deepFreeze(JSON.parse(await readFile(
  new URL('../../schemas/migration-checklist-extractive-candidate.schema.json', import.meta.url),
  'utf8'
)));

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(MIGRATION_EXTRACTIVE_CANDIDATE_SCHEMA);

export function migrationExtractiveCandidateSchemaDigest() {
  return `sha256:${createHash('sha256')
    .update(canonicalJsonBytes(MIGRATION_EXTRACTIVE_CANDIDATE_SCHEMA))
    .digest('hex')}`;
}

export class MigrationExtractiveCandidateError extends Error {
  constructor(code, message) {
    if (!MIGRATION_EXTRACTIVE_CANDIDATE_ERROR_CODES.includes(code)) {
      throw new TypeError('Unknown extractive candidate error code.');
    }
    super(message);
    this.name = 'MigrationExtractiveCandidateError';
    this.code = code;
  }
}

export function isMigrationExtractiveCandidateError(error) {
  return error instanceof MigrationExtractiveCandidateError;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, '\n');
}

function parseCandidate(output) {
  if (typeof output !== 'string') return output;
  try {
    return JSON.parse(output);
  } catch {
    throw new MigrationExtractiveCandidateError(
      'OUTPUT_JSON_INVALID',
      'Migration Checklist extractive candidate is not valid JSON.'
    );
  }
}

export function validateMigrationExtractiveCandidate(output) {
  const candidate = parseCandidate(output);
  if (!validateSchema(candidate)) {
    throw new MigrationExtractiveCandidateError(
      'OUTPUT_SCHEMA_INVALID',
      `Migration Checklist extractive candidate schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`
    );
  }
  if (candidate.status === 'ACTIONABLE'
      && (candidate.actions.length === 0 || candidate.abstentionReason !== null)) {
    throw new MigrationExtractiveCandidateError(
      'OUTPUT_SEMANTICS_INVALID',
      'ACTIONABLE extractive candidates require actions and a null abstentionReason.'
    );
  }
  if (candidate.status === 'ABSTAIN'
      && (candidate.actions.length !== 0 || candidate.abstentionReason === null)) {
    throw new MigrationExtractiveCandidateError(
      'OUTPUT_SEMANTICS_INVALID',
      'ABSTAIN extractive candidates require no actions and a constrained abstentionReason.'
    );
  }
  return deepFreeze(structuredClone(candidate));
}

function trustError(code, message, detailCode) {
  return new MigrationChecklistTrustError(code, message, { detailCode });
}

function compareAction(left, right) {
  return compareText(left.evidenceRef, right.evidenceRef)
    || compareText(left.actionExcerpt, right.actionExcerpt);
}

/**
 * Validate provenance, exact membership, ownership, and structural content only.
 * This does not claim general semantic applicability to the repository.
 */
export function trustValidateMigrationExtractiveCandidate(candidate, context) {
  const allowlist = new Set(context.evidenceAllowlist);
  const evidenceById = new Map(context.evidence.map((item) => [item.id, item]));
  const seen = new Set();
  const actions = [];

  for (const rawAction of candidate.actions) {
    if (!allowlist.has(rawAction.evidenceRef) || !evidenceById.has(rawAction.evidenceRef)) {
      throw trustError(
        'EVIDENCE_REFERENCE_INVALID',
        'Extractive candidate references evidence outside its exact context allowlist.',
        'UNKNOWN_EVIDENCE_REFERENCE'
      );
    }
    const action = {
      evidenceRef: rawAction.evidenceRef,
      actionExcerpt: normalizeLineEndings(rawAction.actionExcerpt)
    };
    const evidenceContent = normalizeLineEndings(evidenceById.get(action.evidenceRef).content);
    if (!evidenceContent.includes(action.actionExcerpt)) {
      throw trustError(
        'SUPPORTING_EXCERPT_INVALID',
        'Selected guidance is not an exact substring of its selected evidence record.',
        'EXCERPT_NOT_EXACT'
      );
    }
    const key = `${action.evidenceRef}\0${action.actionExcerpt}`;
    if (seen.has(key)) {
      throw trustError(
        'DUPLICATE_ITEM',
        'Extractive candidate contains a duplicate evidence span.',
        'DUPLICATE_EVIDENCE_SPAN'
      );
    }
    seen.add(key);

    const instruction = `${MIGRATION_EXTRACTIVE_PRESENTATION_PREFIX}${action.actionExcerpt}`;
    validateMigrationChecklistInstructionTrust(instruction, action.actionExcerpt);
    actions.push({
      ...action,
      instruction,
      evidenceRefs: [action.evidenceRef]
    });
  }

  return deepFreeze({
    status: candidate.status,
    items: actions.sort(compareAction),
    abstentionReason: candidate.abstentionReason
  });
}
