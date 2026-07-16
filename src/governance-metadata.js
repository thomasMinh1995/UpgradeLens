import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalJsonBytes } from './canonical-json.js';
import {
  CAPABILITY_PROFILE_FILENAME,
  DEPLOYMENT_PROFILE_FILENAME,
  QUALIFICATION_RECORD_FILENAME
} from './constants.js';
import { compareText } from './portable.js';

export const GOVERNANCE_SCHEMA_VERSION = '1.0.0';
export const OFFLINE_CONFORMANCE_ENDPOINT = 'https://offline-conformance.invalid/v1/chat/completions';

const [capabilitySchema, deploymentSchema, qualificationSchema] = await Promise.all([
  readSchema('../schemas/capability-profile.schema.json'),
  readSchema('../schemas/deployment-profile.schema.json'),
  readSchema('../schemas/qualification-record.schema.json')
]);
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateCapabilitySchema = ajv.compile(capabilitySchema);
const validateDeploymentSchema = ajv.compile(deploymentSchema);
const validateQualificationSchema = ajv.compile(qualificationSchema);

async function readSchema(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), 'utf8'));
}

const FORBIDDEN_KEY = /(?:authorization|api[_-]?key|secret|token|password|credential|private[_-]?key|prompt|evidence|repository(?:data)?)/i;
const FORBIDDEN_VALUE = /(?:\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i;

export function assertNoGovernanceSecrets(value, currentPath = '$') {
  if (typeof value === 'string') {
    if (FORBIDDEN_VALUE.test(value)) {
      throw new Error(`Governance metadata validation error: secret-like value at ${currentPath}.`);
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoGovernanceSecrets(item, `${currentPath}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw new Error(`Governance metadata validation error: forbidden field ${currentPath}.${key}.`);
    }
    assertNoGovernanceSecrets(item, `${currentPath}.${key}`);
  }
}

function schemaError(kind, validate) {
  return new Error(`${kind} validation error: schema validation failed: ${ajv.errorsText(validate.errors, { separator: '; ' })}`);
}

function validateVersion(value, kind) {
  if (value?.schemaVersion !== GOVERNANCE_SCHEMA_VERSION) {
    throw new Error(`${kind} validation error: unsupported schema version; expected ${GOVERNANCE_SCHEMA_VERSION}.`);
  }
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function isSorted(values) {
  return values.every((value, index) => index === 0 || compareText(values[index - 1], value) <= 0);
}

export function buildCapabilityProfile({
  capabilityId,
  protocol,
  structuredOutput,
  jsonMode,
  streaming,
  toolCalling,
  responsesApi,
  usageMetadata,
  identityVerification,
  timeoutSupported
}) {
  return validateCapabilityProfile({
    schemaVersion: GOVERNANCE_SCHEMA_VERSION,
    capabilityId,
    protocol,
    structuredOutput,
    jsonMode,
    streaming,
    toolCalling,
    responsesApi,
    usageMetadata,
    identityVerification,
    timeoutSupported
  });
}

export function validateCapabilityProfile(profile) {
  assertNoGovernanceSecrets(profile);
  validateCapabilityProfileSchema(profile);
  if (profile.structuredOutput === 'jsonMode' && !profile.jsonMode) {
    throw new Error('Capability Profile validation error: jsonMode must be true when it is the structured output mode.');
  }
  return profile;
}

export function validateCapabilityProfileSchema(profile) {
  validateVersion(profile, 'Capability Profile');
  if (!validateCapabilitySchema(profile)) throw schemaError('Capability Profile', validateCapabilitySchema);
  return profile;
}

export function buildDeploymentProfile({
  deploymentId,
  provider,
  endpoint,
  model,
  capabilityProfile,
  capabilityProfileDigest,
  modelRevision,
  timeoutSeconds,
  maxResponseBytes
}) {
  return validateDeploymentProfile({
    schemaVersion: GOVERNANCE_SCHEMA_VERSION,
    deploymentId,
    provider,
    endpoint,
    model,
    capabilityProfile,
    capabilityProfileDigest,
    ...(modelRevision === undefined ? {} : { modelRevision }),
    timeoutSeconds,
    maxResponseBytes
  });
}

export function validateDeploymentProfile(profile) {
  assertNoGovernanceSecrets(profile);
  validateDeploymentProfileSchema(profile);
  const endpoint = new URL(profile.endpoint);
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('Deployment Profile validation error: endpoint must use HTTP or HTTPS.');
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('Deployment Profile validation error: endpoint must not contain credentials, query parameters, or fragments.');
  }
  return profile;
}

export function validateDeploymentProfileSchema(profile) {
  validateVersion(profile, 'Deployment Profile');
  if (!validateDeploymentSchema(profile)) throw schemaError('Deployment Profile', validateDeploymentSchema);
  return profile;
}

export function buildQualificationRecord({
  qualificationId,
  deploymentProfileDigest,
  capabilityProfileDigest,
  conformanceReportDigest = null,
  status,
  qualifiedFor
}) {
  return validateQualificationRecord({
    schemaVersion: GOVERNANCE_SCHEMA_VERSION,
    qualificationId,
    deploymentProfileDigest,
    capabilityProfileDigest,
    conformanceReportDigest,
    status,
    qualifiedFor: sortedUnique(qualifiedFor)
  });
}

export function validateQualificationRecord(record) {
  assertNoGovernanceSecrets(record);
  validateQualificationRecordSchema(record);
  if (!isSorted(record.qualifiedFor)) {
    throw new Error('Qualification Record validation error: qualifiedFor must use stable lexical ordering.');
  }
  if (['SUPPORTED', 'CERTIFIED'].includes(record.status) && record.conformanceReportDigest === null) {
    throw new Error(`Qualification Record validation error: ${record.status} requires a conformanceReportDigest.`);
  }
  return record;
}

export function validateQualificationRecordSchema(record) {
  validateVersion(record, 'Qualification Record');
  if (!validateQualificationSchema(record)) throw schemaError('Qualification Record', validateQualificationSchema);
  return record;
}

function metadataDigest(value, validate) {
  validate(value);
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

export function capabilityProfileDigest(profile) {
  return metadataDigest(profile, validateCapabilityProfile);
}

export function deploymentProfileDigest(profile) {
  return metadataDigest(profile, validateDeploymentProfile);
}

export function qualificationRecordDigest(record) {
  return metadataDigest(record, validateQualificationRecord);
}

function serialize(value, validate) {
  validate(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function serializeCapabilityProfile(profile) {
  return serialize(profile, validateCapabilityProfile);
}

export function serializeDeploymentProfile(profile) {
  return serialize(profile, validateDeploymentProfile);
}

export function serializeQualificationRecord(record) {
  return serialize(record, validateQualificationRecord);
}

async function writePrivateJson(outputPath, value, serializer) {
  const target = path.resolve(outputPath);
  const temporary = `${target}.${process.pid}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  let handle;
  try {
    handle = await open(temporary, 'w', 0o600);
    await handle.writeFile(serializer(value), 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return target;
}

export function writeCapabilityProfile(outputPath, profile) {
  return writePrivateJson(outputPath, profile, serializeCapabilityProfile);
}

export function writeDeploymentProfile(outputPath, profile) {
  return writePrivateJson(outputPath, profile, serializeDeploymentProfile);
}

export function writeQualificationRecord(outputPath, record) {
  return writePrivateJson(outputPath, record, serializeQualificationRecord);
}

function portableId(value, fallback) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .slice(0, 96);
  return normalized || fallback;
}

export function createDefaultGovernanceArtifacts({
  provider = 'openai-compatible',
  endpoint = OFFLINE_CONFORMANCE_ENDPOINT,
  model = 'offline-fixture',
  timeoutSeconds = 180,
  maxResponseBytes = 1_048_576,
  qualifiedFor = ['MVP-03']
} = {}) {
  const providerId = portableId(provider, 'runtime');
  const modelId = portableId(model, 'model');
  const capabilityProfile = buildCapabilityProfile({
    capabilityId: `${providerId}-v1`,
    protocol: 'chat-completions',
    structuredOutput: 'jsonSchema',
    jsonMode: false,
    streaming: false,
    toolCalling: false,
    responsesApi: false,
    usageMetadata: true,
    identityVerification: true,
    timeoutSupported: true
  });
  const deploymentId = portableId(`${providerId}-${modelId}`, 'offline-deployment');
  const deploymentProfile = buildDeploymentProfile({
    deploymentId,
    provider,
    endpoint,
    model,
    capabilityProfile: capabilityProfile.capabilityId,
    capabilityProfileDigest: capabilityProfileDigest(capabilityProfile),
    timeoutSeconds,
    maxResponseBytes
  });
  const qualificationRecord = buildQualificationRecord({
    qualificationId: portableId(`${deploymentProfile.deploymentId}-mvp-03`, 'runtime-mvp-03'),
    deploymentProfileDigest: deploymentProfileDigest(deploymentProfile),
    capabilityProfileDigest: capabilityProfileDigest(capabilityProfile),
    conformanceReportDigest: null,
    status: 'EXPERIMENTAL',
    qualifiedFor
  });
  return { capabilityProfile, deploymentProfile, qualificationRecord };
}

export function serializeGovernanceArtifacts(artifacts) {
  validateCapabilityProfile(artifacts?.capabilityProfile);
  validateDeploymentProfile(artifacts?.deploymentProfile);
  validateQualificationRecord(artifacts?.qualificationRecord);
  return `${JSON.stringify({
    capabilityProfile: artifacts.capabilityProfile,
    deploymentProfile: artifacts.deploymentProfile,
    qualificationRecord: artifacts.qualificationRecord
  }, null, 2)}\n`;
}

export async function writeGovernanceArtifacts(outputDirectory, artifacts) {
  validateCapabilityProfile(artifacts?.capabilityProfile);
  validateDeploymentProfile(artifacts?.deploymentProfile);
  validateQualificationRecord(artifacts?.qualificationRecord);
  const directory = path.resolve(outputDirectory);
  const capabilityProfile = await writeCapabilityProfile(
    path.join(directory, CAPABILITY_PROFILE_FILENAME),
    artifacts.capabilityProfile
  );
  const deploymentProfile = await writeDeploymentProfile(
    path.join(directory, DEPLOYMENT_PROFILE_FILENAME),
    artifacts.deploymentProfile
  );
  const qualificationRecord = await writeQualificationRecord(
    path.join(directory, QUALIFICATION_RECORD_FILENAME),
    artifacts.qualificationRecord
  );
  return { capabilityProfile, deploymentProfile, qualificationRecord };
}
