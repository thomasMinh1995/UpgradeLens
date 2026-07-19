import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { canonicalJson, canonicalJsonBytes } from './canonical-json.js';
import { DEFAULT_OUTPUT_DIRECTORY } from './constants.js';
import { compareText } from './portable.js';

export const DEFAULT_KNOWLEDGE_CACHE_DIRECTORY =
  `${DEFAULT_OUTPUT_DIRECTORY}/cache/knowledge/v1`;

const ENVELOPE_VERSION = '1';
const IDENTITY_FIELDS = [
  'adapter',
  'resourceKind',
  'packageId',
  'resourceVariant',
  'adapterVersion'
];
const ENVELOPE_FIELDS = [
  'envelopeVersion',
  'identity',
  'storedAt',
  'expiresAt',
  'bodyDigest',
  'body'
];
const ISO_UTC_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const FORBIDDEN_BODY_KEYS = new Set([
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'etag',
  'lastmodified',
  'headers',
  'cachekey',
  'stack',
  'password',
  'credential',
  'credentials',
  'secret',
  'token',
  'accesstoken',
  'apikey',
  'clientsecret',
  'privatekey'
]);

const defaultFileSystem = { mkdir, open, readFile, rename, rm };

export class KnowledgeCacheError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'KnowledgeCacheError';
    this.code = code;
  }
}

function sameFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort(compareText);
  return keys.length === fields.length && keys.every((key, index) => key === [...fields].sort(compareText)[index]);
}

function isUnsafeIdentityValue(value) {
  return typeof value !== 'string'
    || value.length === 0
    || value.trim() !== value
    || /[\u0000-\u001f\u007f\\\s]/.test(value)
    || value.startsWith('/')
    || /^[A-Za-z]:/.test(value)
    || value.includes('..')
    || /[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(value);
}

function identityError(message) {
  throw new KnowledgeCacheError('KNOWLEDGE_CACHE_INVALID_IDENTITY', message);
}

/**
 * Create the canonical logical identity used for a single cached resource.
 * The filesystem key is derived internally and is never written to envelopes.
 */
export function createCacheIdentity(input) {
  if (!sameFields(input, IDENTITY_FIELDS)) {
    identityError('Cache identity must contain exactly the required fields.');
  }
  for (const field of IDENTITY_FIELDS) {
    if (isUnsafeIdentityValue(input[field])) {
      identityError(`Cache identity field ${field} must be a portable non-empty string.`);
    }
  }
  return Object.freeze(Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, input[field]])));
}

function identityKey(identity) {
  return createHash('sha256').update(canonicalJson(identity), 'utf8').digest('hex');
}

function bodyDigest(body) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(body)).digest('hex')}`;
}

function normalizedForbiddenKey(key) {
  return key.toLowerCase().replace(/[-_]/g, '');
}

function inspectBodyPrivacy(value, currentPath = '$', ancestors = new Set()) {
  if (typeof value === 'string') {
    if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) {
      return `${currentPath} contains an absolute path.`;
    }
    if (/[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(value)) {
      return `${currentPath} contains URL credentials.`;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  if (ancestors.has(value)) return null;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const result = inspectBodyPrivacy(value[index], `${currentPath}[${index}]`, ancestors);
        if (result) return result;
      }
      return null;
    }
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_BODY_KEYS.has(normalizedForbiddenKey(key))) {
        return `${currentPath}.${key} is not permitted in a cache body.`;
      }
      const result = inspectBodyPrivacy(value[key], `${currentPath}.${key}`, ancestors);
      if (result) return result;
    }
    return null;
  } finally {
    ancestors.delete(value);
  }
}

function sanitizeBody(body) {
  let canonical;
  try {
    canonical = canonicalJson(body);
  } catch {
    throw new KnowledgeCacheError('KNOWLEDGE_CACHE_INVALID_BODY', 'Cache body must be JSON-compatible.');
  }
  const privacyError = inspectBodyPrivacy(body);
  if (privacyError) {
    throw new KnowledgeCacheError('KNOWLEDGE_CACHE_INVALID_BODY', `Cache body is not portable: ${privacyError}`);
  }
  return JSON.parse(canonical);
}

function validUtcDate(value) {
  if (typeof value !== 'string' || !ISO_UTC_MILLISECONDS.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : date;
}

function resultForEnvelope(envelope, now) {
  const expiresAt = new Date(envelope.expiresAt);
  return {
    status: now.getTime() < expiresAt.getTime() ? 'fresh' : 'expired',
    body: envelope.body,
    storedAt: envelope.storedAt,
    expiresAt: envelope.expiresAt,
    bodyDigest: envelope.bodyDigest
  };
}

function validateEnvelope(envelope, expectedIdentity) {
  if (!sameFields(envelope, ENVELOPE_FIELDS)) return { valid: false, reason: 'unexpected-envelope-fields' };
  if (envelope.envelopeVersion !== ENVELOPE_VERSION) return { valid: false, reason: 'unsupported-envelope-version' };

  let identity;
  try {
    identity = createCacheIdentity(envelope.identity);
  } catch {
    return { valid: false, reason: 'invalid-identity' };
  }
  if (canonicalJson(identity) !== canonicalJson(expectedIdentity)) {
    return { valid: false, reason: 'identity-mismatch' };
  }
  const storedAt = validUtcDate(envelope.storedAt);
  const expiresAt = validUtcDate(envelope.expiresAt);
  if (!storedAt || !expiresAt || expiresAt.getTime() < storedAt.getTime()) {
    return { valid: false, reason: 'invalid-timestamps' };
  }
  if (typeof envelope.bodyDigest !== 'string' || !DIGEST.test(envelope.bodyDigest)) {
    return { valid: false, reason: 'invalid-body-digest' };
  }
  try {
    const normalizedBody = sanitizeBody(envelope.body);
    if (bodyDigest(normalizedBody) !== envelope.bodyDigest) {
      return { valid: false, reason: 'body-digest-mismatch' };
    }
  } catch {
    return { valid: false, reason: 'invalid-body' };
  }
  return { valid: true };
}

function currentDate(clock) {
  const value = clock();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new KnowledgeCacheError('KNOWLEDGE_CACHE_INVALID_CLOCK', 'Knowledge Store clock returned an invalid time.');
  }
  return date;
}

function ttlDate(storedAt, ttlMs) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 0) {
    throw new KnowledgeCacheError('KNOWLEDGE_CACHE_INVALID_TTL', 'Cache TTL must be a non-negative integer number of milliseconds.');
  }
  const expiresAt = new Date(storedAt.getTime() + ttlMs);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new KnowledgeCacheError('KNOWLEDGE_CACHE_INVALID_TTL', 'Cache TTL produces an invalid expiry time.');
  }
  return expiresAt;
}

function operationalError(code, message) {
  return new KnowledgeCacheError(code, message);
}

/**
 * Construct the small private filesystem cache used by future registry
 * adapters. Its root and storage layout are intentionally absent from the
 * Knowledge Manifest contract.
 */
export function createKnowledgeCache({
  rootDirectory = DEFAULT_KNOWLEDGE_CACHE_DIRECTORY,
  clock = () => new Date(),
  fileSystem = defaultFileSystem
} = {}) {
  if (typeof rootDirectory !== 'string' || rootDirectory.length === 0) {
    throw new KnowledgeCacheError('KNOWLEDGE_CACHE_INVALID_ROOT', 'Knowledge Store root directory must be a non-empty string.');
  }
  if (typeof clock !== 'function') {
    throw new KnowledgeCacheError('KNOWLEDGE_CACHE_INVALID_CLOCK', 'Knowledge Store clock must be a function.');
  }
  for (const method of ['mkdir', 'open', 'readFile', 'rename', 'rm']) {
    if (typeof fileSystem?.[method] !== 'function') {
      throw new KnowledgeCacheError('KNOWLEDGE_CACHE_INVALID_FILESYSTEM', 'Knowledge Store filesystem adapter is incomplete.');
    }
  }

  let temporarySequence = 0;
  const entryPath = (identity) => path.join(rootDirectory, `${identityKey(createCacheIdentity(identity))}.json`);

  return {
    async read(identity) {
      const expectedIdentity = createCacheIdentity(identity);
      let text;
      try {
        text = await fileSystem.readFile(entryPath(expectedIdentity), 'utf8');
      } catch (error) {
        if (error?.code === 'ENOENT') return { status: 'missing' };
        throw operationalError('KNOWLEDGE_CACHE_READ_FAILED', 'Unable to read Knowledge Store entry.');
      }

      let envelope;
      try {
        envelope = JSON.parse(text);
      } catch {
        return { status: 'corrupted', reason: 'invalid-json' };
      }
      const validation = validateEnvelope(envelope, expectedIdentity);
      if (!validation.valid) return { status: 'corrupted', reason: validation.reason };
      return resultForEnvelope(envelope, currentDate(clock));
    },

    async write(identity, body, { ttlMs } = {}) {
      const normalizedIdentity = createCacheIdentity(identity);
      const normalizedBody = sanitizeBody(body);
      const storedAtDate = currentDate(clock);
      const expiresAtDate = ttlDate(storedAtDate, ttlMs);
      const envelope = {
        envelopeVersion: ENVELOPE_VERSION,
        identity: normalizedIdentity,
        storedAt: storedAtDate.toISOString(),
        expiresAt: expiresAtDate.toISOString(),
        bodyDigest: bodyDigest(normalizedBody),
        body: normalizedBody
      };
      const finalPath = entryPath(normalizedIdentity);
      const temporaryPath = `${finalPath}.${process.pid}.${temporarySequence += 1}.tmp`;
      const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
      let handle;
      try {
        await fileSystem.mkdir(path.dirname(finalPath), { recursive: true });
        handle = await fileSystem.open(temporaryPath, 'w', 0o600);
        await handle.writeFile(serialized, 'utf8');
        await handle.sync();
        await handle.close();
        handle = undefined;
        await fileSystem.rename(temporaryPath, finalPath);
      } catch {
        try {
          if (handle) await handle.close();
        } catch {
          // Closing is best effort after an already-failed write.
        }
        try {
          await fileSystem.rm(temporaryPath, { force: true });
        } catch {
          // Cleanup is best effort; the final entry remains protected by rename.
        }
        throw operationalError('KNOWLEDGE_CACHE_WRITE_FAILED', 'Unable to write Knowledge Store entry.');
      }
      return {
        status: 'written',
        storedAt: envelope.storedAt,
        expiresAt: envelope.expiresAt,
        bodyDigest: envelope.bodyDigest
      };
    }
  };
}
