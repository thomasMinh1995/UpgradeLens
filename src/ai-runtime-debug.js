import { createHash } from 'node:crypto';

import { canonicalJsonBytes } from './canonical-json.js';
import { compareText } from './portable.js';

const MAX_DEBUG_TEXT_CHARACTERS = 500;
const MAX_SCHEMA_NODES = 10_000;
const MAX_SCHEMA_DEPTH = 64;
const SCHEMA_KEYWORDS = Object.freeze([
  '$schema',
  '$type',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'enum',
  'const',
  'pattern',
  'format',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'anyOf',
  'oneOf',
  'allOf',
  '$ref',
  'definitions',
  '$defs'
]);

function digestBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function digestText(value) {
  return digestBytes(Buffer.from(value, 'utf8'));
}

function redactDebugSecrets(value) {
  return value
    .replace(/\bbearer\s+[^\s"',;]+/gi, '[REDACTED_AUTH]')
    .replace(/\bsk-or-v1-[a-z0-9_-]+/gi, '[REDACTED_KEY]')
    .replace(/\bsk-[a-z0-9_-]+/gi, '[REDACTED_KEY]')
    .replace(/\b(api[_-]?key|authorization)\s*[=:]\s*[^\s"',;&]+/gi, '$1=[REDACTED]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[REDACTED]@')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b(account(?:_id)?|billing(?:_id|_detail)?)\s*[=:]\s*[^\s"',;&]+/gi, '$1=[REDACTED]');
}

export function sanitizeDebugText(value, maxCharacters = MAX_DEBUG_TEXT_CHARACTERS) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters <= 0) {
    throw new TypeError('maxCharacters must be a positive integer.');
  }
  const normalized = String(value)
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return redactDebugSecrets(normalized).slice(0, maxCharacters);
}

export function isAiRuntimeDebugEnabled(env = {}) {
  const raw = env?.UPGRADELENS_AI_DEBUG;
  if (raw === undefined || raw === '0' || String(raw).toLowerCase() === 'false') return false;
  if (raw === '1' || String(raw).toLowerCase() === 'true') return true;
  throw new TypeError('UPGRADELENS_AI_DEBUG must be one of: 1, true, 0, false.');
}

function boundedSchemaSnapshot(value, state, depth = 0) {
  if (value === null || typeof value !== 'object') return value;
  if (depth > MAX_SCHEMA_DEPTH) {
    state.truncated = true;
    return '[MAX_DEPTH]';
  }
  if (state.seen.has(value)) return '[CIRCULAR]';
  if (state.visitedNodes >= MAX_SCHEMA_NODES) {
    state.truncated = true;
    return '[MAX_NODES]';
  }
  state.seen.add(value);
  state.visitedNodes += 1;
  try {
    if (Array.isArray(value)) {
      const items = [];
      for (const item of value) {
        if (state.visitedEntries >= MAX_SCHEMA_NODES) {
          state.truncated = true;
          items.push('[MAX_ENTRIES]');
          break;
        }
        state.visitedEntries += 1;
        items.push(boundedSchemaSnapshot(item, state, depth + 1));
      }
      return items;
    }
    const entries = [];
    for (const key of Object.keys(value).sort(compareText)) {
      if (state.visitedEntries >= MAX_SCHEMA_NODES) {
        state.truncated = true;
        break;
      }
      state.visitedEntries += 1;
      entries.push([key, boundedSchemaSnapshot(value[key], state, depth + 1)]);
    }
    return Object.fromEntries(entries);
  } finally {
    state.seen.delete(value);
  }
}

function countSchemaKeywords(value) {
  const keywordCounts = Object.fromEntries(SCHEMA_KEYWORDS.map((keyword) => [keyword, 0]));
  const state = { seen: new WeakSet(), visitedNodes: 0, visitedEntries: 0, truncated: false };

  function visit(current, depth) {
    if (!current || typeof current !== 'object') return;
    if (depth > MAX_SCHEMA_DEPTH || state.visitedNodes >= MAX_SCHEMA_NODES) {
      state.truncated = true;
      return;
    }
    if (state.seen.has(current)) return;
    state.seen.add(current);
    state.visitedNodes += 1;
    try {
      if (Array.isArray(current)) {
        for (const item of current) {
          if (state.visitedEntries >= MAX_SCHEMA_NODES) {
            state.truncated = true;
            break;
          }
          state.visitedEntries += 1;
          visit(item, depth + 1);
        }
        return;
      }
      for (const key of Object.keys(current).sort(compareText)) {
        if (state.visitedEntries >= MAX_SCHEMA_NODES) {
          state.truncated = true;
          break;
        }
        state.visitedEntries += 1;
        if (Object.hasOwn(keywordCounts, key)) keywordCounts[key] += 1;
        const child = current[key];
        if (['properties', '$defs', 'definitions'].includes(key)
          && child && typeof child === 'object' && !Array.isArray(child)) {
          for (const schemaName of Object.keys(child).sort(compareText)) {
            if (state.visitedEntries >= MAX_SCHEMA_NODES) {
              state.truncated = true;
              break;
            }
            state.visitedEntries += 1;
            visit(child[schemaName], depth + 1);
          }
        } else {
          visit(child, depth + 1);
        }
      }
    } finally {
      state.seen.delete(current);
    }
  }

  visit(value, 0);
  return { keywordCounts, visitedNodeCount: state.visitedNodes, traversalTruncated: state.truncated };
}

export function buildSchemaDiagnostics(schema) {
  const snapshotState = {
    seen: new WeakSet(),
    visitedNodes: 0,
    visitedEntries: 0,
    truncated: false
  };
  const snapshot = boundedSchemaSnapshot(schema, snapshotState);
  const canonicalBytes = canonicalJsonBytes(snapshot);
  let schemaBytes;
  try {
    schemaBytes = Buffer.byteLength(JSON.stringify(schema), 'utf8');
  } catch {
    schemaBytes = canonicalBytes.length;
  }
  const traversal = countSchemaKeywords(schema);
  const topLevelKeys = schema && typeof schema === 'object' && !Array.isArray(schema)
    ? Object.keys(schema).sort(compareText).map((key) => sanitizeDebugText(key, 128))
    : [];
  return {
    schemaDigest: digestBytes(canonicalBytes),
    schemaBytes,
    topLevelKeys,
    propertyCount: schema?.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? Object.keys(schema.properties).length
      : 0,
    requiredCount: Array.isArray(schema?.required) ? schema.required.length : 0,
    keywordCounts: traversal.keywordCounts,
    visitedNodeCount: traversal.visitedNodeCount,
    traversalTruncated: snapshotState.truncated || traversal.traversalTruncated
  };
}

export function parseProviderErrorDescriptor(responseText) {
  try {
    const body = JSON.parse(responseText);
    const error = body && typeof body === 'object' ? body.error : null;
    if (!error || typeof error !== 'object' || Array.isArray(error)) return Object.freeze({});
    const metadata = error.metadata && typeof error.metadata === 'object' && !Array.isArray(error.metadata)
      ? error.metadata
      : {};
    return Object.freeze(Object.fromEntries(Object.entries({
      code: sanitizeDebugText(error.code),
      type: sanitizeDebugText(error.type),
      message: sanitizeDebugText(error.message),
      metadataErrorType: sanitizeDebugText(metadata.error_type),
      metadataCode: sanitizeDebugText(metadata.code),
      metadataMessage: sanitizeDebugText(metadata.message)
    }).filter(([, value]) => value.length > 0)));
  } catch {
    return Object.freeze({});
  }
}

export function buildRequestDebugRecord({
  provider,
  endpoint,
  model,
  requestBody,
  serializedBody,
  structuredOutputMode = 'jsonSchema',
  requestExtraKeys = []
}) {
  const url = endpoint instanceof URL ? endpoint : new URL(endpoint);
  const schema = requestBody?.response_format?.json_schema?.schema;
  const diagnostics = buildSchemaDiagnostics(schema);
  return {
    event: 'ai.runtime.request',
    provider: sanitizeDebugText(provider, 128),
    endpoint: {
      protocol: url.protocol,
      hostname: url.hostname,
      pathname: url.pathname
    },
    model: sanitizeDebugText(model, 256),
    method: 'POST',
    stream: requestBody?.stream === true,
    messageCount: Array.isArray(requestBody?.messages) ? requestBody.messages.length : 0,
    messages: (requestBody?.messages ?? []).map((message) => ({
      role: sanitizeDebugText(message?.role, 32),
      characterCount: typeof message?.content === 'string' ? message.content.length : 0,
      sha256: digestText(typeof message?.content === 'string' ? message.content : '')
    })),
    structuredOutput: {
      mode: structuredOutputMode,
      name: sanitizeDebugText(requestBody?.response_format?.json_schema?.name, 128),
      strict: requestBody?.response_format?.json_schema?.strict === true,
      schemaDigest: diagnostics.schemaDigest,
      schemaBytes: diagnostics.schemaBytes,
      schemaKeywords: diagnostics.topLevelKeys
    },
    schemaDiagnostics: {
      propertyCount: diagnostics.propertyCount,
      requiredCount: diagnostics.requiredCount,
      keywordCounts: diagnostics.keywordCounts,
      visitedNodeCount: diagnostics.visitedNodeCount,
      traversalTruncated: diagnostics.traversalTruncated
    },
    requestBodyBytes: Buffer.byteLength(serializedBody, 'utf8'),
    requestExtraKeys: [...requestExtraKeys].sort(compareText).map((key) => sanitizeDebugText(key, 128))
  };
}

export function buildResponseDebugRecord({
  status,
  contentType,
  responseText,
  body,
  assistantContent,
  requestedModel,
  actualModel,
  usage,
  latencyMs
}) {
  return {
    event: 'ai.runtime.response',
    status,
    contentType: sanitizeDebugText(contentType, 128),
    responseBytes: Buffer.byteLength(responseText, 'utf8'),
    requestedModel: sanitizeDebugText(requestedModel, 256),
    actualModel: actualModel === null ? null : sanitizeDebugText(actualModel, 256),
    choiceCount: Array.isArray(body?.choices) ? body.choices.length : 0,
    finishReason: sanitizeDebugText(body?.choices?.[0]?.finish_reason, 64),
    usage,
    latencyMs,
    assistantContentChars: assistantContent.length,
    assistantContentDigest: digestText(assistantContent)
  };
}

export function buildErrorDebugRecord({
  status,
  runtimeError,
  providerError,
  responseText,
  latencyMs
}) {
  return {
    event: 'ai.runtime.error',
    status,
    runtimeCode: runtimeError.code,
    retryable: runtimeError.retryable,
    providerError: Object.fromEntries(Object.entries(providerError).map(([key, value]) => [
      key,
      sanitizeDebugText(value)
    ])),
    responseBytes: Buffer.byteLength(responseText, 'utf8'),
    latencyMs
  };
}

export function writeAiRuntimeDebugRecord(writer, record) {
  const line = `${JSON.stringify(record)}\n`;
  if (typeof writer === 'function') writer(line);
  else if (writer && typeof writer.write === 'function') writer.write(line);
  else throw new TypeError('AI runtime debug writer must be a function or writable stream.');
}
