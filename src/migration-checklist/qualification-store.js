import { createHash } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  rename,
  rm
} from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalJsonBytes } from '../canonical-json.js';
import {
  DEFAULT_MIGRATION_PLANNING_QUALIFICATION_PATH
} from '../constants.js';
import { compareText, isPortableRelativePath, isSorted } from '../portable.js';

const schema = JSON.parse(await readFile(
  new URL('../../schemas/migration-planning-qualification-record.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

export const MIGRATION_PLANNING_QUALIFICATION_RECORD_SCHEMA_VERSION = '1.0.0';

export class MigrationQualificationStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MigrationQualificationStoreError';
    this.code = code;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

function recordMaterial(record) {
  return {
    schemaVersion: record.schemaVersion,
    qualification: record.qualification
  };
}

function duplicate(values) {
  return values.find((value, index) => values.indexOf(value) !== index) ?? null;
}

function containsSensitiveValue(value) {
  if (typeof value === 'string') {
    return /(?:\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{8,}|(?:api[_ -]?key|access[_ -]?token|authorization|client[_ -]?secret)\s*[:=])/i.test(value)
      || /https?:\/\/[^/\s:@]+:[^/\s@]+@/i.test(value);
  }
  if (Array.isArray(value)) return value.some(containsSensitiveValue);
  if (value && typeof value === 'object') return Object.values(value).some(containsSensitiveValue);
  return false;
}

function invariantErrors(record) {
  const errors = [];
  const qualification = record.qualification;
  if (qualification.qualificationId !== digest(qualification.identity)) {
    errors.push('qualificationId does not match the exact qualification identity.');
  }
  if (record.recordDigest !== digest(recordMaterial(record))) {
    errors.push('recordDigest does not match the canonical persisted qualification material.');
  }
  const duplicateMetric = duplicate(qualification.thresholdResults.map((item) => item.metric));
  if (duplicateMetric) errors.push(`duplicate threshold metric ${duplicateMetric}.`);
  const duplicateGate = duplicate(qualification.criticalGates.map((item) => item.id));
  if (duplicateGate) errors.push(`duplicate critical gate ${duplicateGate}.`);
  if (!isSorted(qualification.limitations, (left, right) => (
    compareText(left.code, right.code) || compareText(left.message, right.message)
  ))) {
    errors.push('limitations must use deterministic code/message ordering.');
  }
  for (const field of ['observedProviders', 'observedModels']) {
    if (!isSorted(qualification.identity.runtime[field], compareText)) {
      errors.push(`runtime.${field} must be sorted.`);
    }
  }
  const criticalFailure = qualification.criticalGates.some((item) => !item.passed)
    || qualification.thresholdResults.some((item) => item.critical && !item.passed);
  if (qualification.verdict === 'NOT_QUALIFIED' && !criticalFailure) {
    errors.push('NOT_QUALIFIED requires a failed critical gate or threshold.');
  }
  if (['QUALIFIED', 'QUALIFIED_WITH_LIMITATIONS', 'INSUFFICIENT_EVIDENCE'].includes(
    qualification.verdict
  ) && criticalFailure) {
    errors.push(`${qualification.verdict} cannot contain a failed critical gate or threshold.`);
  }
  if (qualification.verdict === 'QUALIFIED' && qualification.limitations.length > 0) {
    errors.push('QUALIFIED cannot contain qualification limitations.');
  }
  if (qualification.verdict === 'QUALIFIED_WITH_LIMITATIONS'
      && qualification.limitations.length === 0) {
    errors.push('QUALIFIED_WITH_LIMITATIONS requires at least one limitation.');
  }
  if (containsSensitiveValue(record)) {
    errors.push('qualification record contains a secret-like value.');
  }
  return errors;
}

export function validateMigrationPlanningQualificationRecordSchema(record) {
  if (!validateSchema(record)) {
    throw new MigrationQualificationStoreError(
      'MIGRATION_QUALIFICATION_RECORD_SCHEMA_INVALID',
      'Migration Planning qualification record failed strict schema validation.'
    );
  }
  return record;
}

export function validateMigrationPlanningQualificationRecord(record) {
  validateMigrationPlanningQualificationRecordSchema(record);
  const errors = invariantErrors(record);
  if (errors.length > 0) {
    const code = errors.some((item) => item.includes('secret-like'))
      ? 'MIGRATION_QUALIFICATION_RECORD_SENSITIVE'
      : 'MIGRATION_QUALIFICATION_RECORD_INTEGRITY_INVALID';
    throw new MigrationQualificationStoreError(
      code,
      'Migration Planning qualification record failed integrity validation.'
    );
  }
  return record;
}

export function buildMigrationPlanningQualificationRecord(qualification) {
  const record = {
    schemaVersion: MIGRATION_PLANNING_QUALIFICATION_RECORD_SCHEMA_VERSION,
    recordDigest: `sha256:${'0'.repeat(64)}`,
    qualification: structuredClone(qualification)
  };
  record.recordDigest = digest(recordMaterial(record));
  return deepFreeze(validateMigrationPlanningQualificationRecord(record));
}

export function serializeMigrationPlanningQualificationRecord(record) {
  validateMigrationPlanningQualificationRecord(record);
  return `${JSON.stringify(record, null, 2)}\n`;
}

function artifactTarget(repositoryRoot, artifactPath) {
  if (!isPortableRelativePath(artifactPath)) {
    throw new MigrationQualificationStoreError(
      'MIGRATION_QUALIFICATION_PATH_INVALID',
      'Migration Planning qualification path must be portable and relative to the repository root.'
    );
  }
  return path.resolve(repositoryRoot, artifactPath);
}

export async function loadMigrationPlanningQualificationRecord(repositoryRoot, {
  artifactPath = DEFAULT_MIGRATION_PLANNING_QUALIFICATION_PATH,
  readArtifact = readFile
} = {}) {
  const target = artifactTarget(repositoryRoot, artifactPath);
  let bytes;
  try {
    bytes = await readArtifact(target);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new MigrationQualificationStoreError(
        'MIGRATION_QUALIFICATION_RECORD_MISSING',
        `Migration Planning qualification record was not found at ${artifactPath}.`
      );
    }
    throw new MigrationQualificationStoreError(
      'MIGRATION_QUALIFICATION_RECORD_UNREADABLE',
      `Migration Planning qualification record could not be read at ${artifactPath}.`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new MigrationQualificationStoreError(
      'MIGRATION_QUALIFICATION_RECORD_INVALID_JSON',
      'Migration Planning qualification record is not valid JSON.'
    );
  }
  return deepFreeze(validateMigrationPlanningQualificationRecord(parsed));
}

export async function writeMigrationPlanningQualificationRecord(
  repositoryRoot,
  qualification,
  {
    artifactPath = DEFAULT_MIGRATION_PLANNING_QUALIFICATION_PATH
  } = {}
) {
  const record = buildMigrationPlanningQualificationRecord(qualification);
  const target = artifactTarget(repositoryRoot, artifactPath);
  const temporary = `${target}.${process.pid}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  let handle;
  try {
    handle = await open(temporary, 'w', 0o600);
    await handle.writeFile(serializeMigrationPlanningQualificationRecord(record), 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, target);
  } catch {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw new MigrationQualificationStoreError(
      'MIGRATION_QUALIFICATION_RECORD_WRITE_FAILED',
      `Migration Planning qualification record could not be written at ${artifactPath}.`
    );
  }
  return artifactPath;
}
