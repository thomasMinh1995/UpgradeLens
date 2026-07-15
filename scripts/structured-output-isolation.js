#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA } from '../src/ai-version-analysis.js';
import {
  buildSchemaDiagnostics,
  sanitizeDebugText
} from '../src/ai-runtime-debug.js';
import {
  DEFAULT_AI_MAX_RESPONSE_BYTES,
  DEFAULT_AI_TIMEOUT_MS,
  validateOpenAiCompatibleEndpoint
} from '../src/openai-compatible-provider.js';

const SYSTEM_PROMPT = 'You are a JSON generator. Return only JSON matching the supplied schema.';
const USER_PROMPT = 'Return one valid object.';
const DEFAULT_REPORT_PATH = 'docs/structured-output-compatibility-report.md';
const MAX_REAL_PROBE_REQUESTS = 10;
const MAX_DEBUG_REQUESTS = 2;
const SCHEMA_KEYWORD_ALLOWLIST = Object.freeze([
  '$schema',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'enum',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'pattern',
  'minLength',
  'maxLength'
]);
const CANONICAL_ERROR_TYPES = new Set([
  'invalid_request',
  'invalid_prompt',
  'unprocessable',
  'payload_too_large',
  'not_found',
  'authentication',
  'permission_denied',
  'payment_required',
  'rate_limit_exceeded',
  'provider_overloaded',
  'provider_unavailable',
  'server',
  'timeout',
  'unmapped'
]);

function clone(value) {
  return structuredClone(value);
}

function objectSchema(properties) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  };
}

function minimalSchema() {
  return objectSchema({ ok: { type: 'boolean' } });
}

export function removeSchemaKeywords(schema, keywords) {
  const removalSet = keywords instanceof Set ? keywords : new Set(keywords);
  function remove(value) {
    if (Array.isArray(value)) return value.map(remove);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !removalSet.has(key))
      .map(([key, child]) => [key, remove(child)]));
  }
  return remove(schema);
}

function independentArraySchema(extra = {}) {
  return objectSchema({
    values: {
      type: 'array',
      items: { type: 'string' },
      ...extra
    }
  });
}

function independentPatternSchema() {
  return objectSchema({
    value: { type: 'string', pattern: '^[A-Za-z0-9_-]+$' }
  });
}

function independentNestedSchema() {
  return objectSchema({
    nested: objectSchema({ value: { type: 'string' } })
  });
}

function independentArrayOfObjectsSchema() {
  return objectSchema({
    items: {
      type: 'array',
      items: objectSchema({ value: { type: 'string' } })
    }
  });
}

export function buildIndependentProbes() {
  const exactWithoutUniqueItems = removeSchemaKeywords(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA, ['uniqueItems']);
  const exactWithoutPattern = removeSchemaKeywords(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA, ['pattern']);
  const exactProjection = removeSchemaKeywords(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA, ['uniqueItems', 'pattern']);
  return [
    { id: 'baseline', label: 'Baseline', introduced: 'minimal json_schema', feature: 'baseline', schema: minimalSchema() },
    { id: 'probe-a', label: 'Array with items', introduced: 'array + items', feature: 'arrayWithItems', schema: independentArraySchema() },
    { id: 'probe-b', label: 'Array with items and uniqueItems', introduced: 'uniqueItems', feature: 'uniqueItems', schema: independentArraySchema({ uniqueItems: true }) },
    { id: 'probe-c', label: 'String with pattern', introduced: 'pattern', feature: 'pattern', schema: independentPatternSchema() },
    { id: 'probe-d', label: 'Nested object', introduced: 'nested object', feature: 'nestedObject', schema: independentNestedSchema() },
    { id: 'probe-e', label: 'Array of strict nested objects', introduced: 'array + items + nested object', feature: 'arrayOfObjects', schema: independentArrayOfObjectsSchema() },
    { id: 'probe-f', label: 'Array with minItems', introduced: 'minItems', feature: 'minItems', schema: independentArraySchema({ minItems: 1 }) },
    { id: 'probe-g', label: 'Exact schema without uniqueItems', introduced: 'remove uniqueItems', feature: 'exactWithoutUniqueItems', removedKeywords: ['uniqueItems'], schema: exactWithoutUniqueItems },
    { id: 'probe-h', label: 'Exact schema without pattern', introduced: 'remove pattern', feature: 'exactWithoutPattern', removedKeywords: ['pattern'], schema: exactWithoutPattern },
    { id: 'probe-i', label: 'Exact schema without uniqueItems and pattern', introduced: 'remove uniqueItems + pattern', feature: 'exactWithoutUniqueItemsAndPattern', removedKeywords: ['uniqueItems', 'pattern'], schema: exactProjection },
    { id: 'probe-j', label: 'Minimal provider-facing exact projection', introduced: 'remove generation-time constraints', feature: 'exactMinimalProjection', removedKeywords: ['uniqueItems', 'pattern'], schema: clone(exactProjection) }
  ];
}

function enumSchema() {
  return objectSchema({
    ok: { type: 'boolean' },
    level: { type: 'string', enum: ['low', 'high'] }
  });
}

function arraySchema({ uniqueItems, items } = {}) {
  const tags = { type: 'array' };
  if (uniqueItems === true) tags.uniqueItems = true;
  if (items) tags.items = items;
  return objectSchema({
    ok: { type: 'boolean' },
    level: { type: 'string', enum: ['low', 'high'] },
    tags
  });
}

function patternSchema() {
  const schema = arraySchema({ uniqueItems: true });
  schema.properties.code = { type: 'string', pattern: '^[A-Z]{2}$' };
  schema.required.push('code');
  return schema;
}

function nestedSchema() {
  const schema = patternSchema();
  schema.properties.nested = objectSchema({ enabled: { type: 'boolean' } });
  schema.required.push('nested');
  return schema;
}

function itemsSchema() {
  const schema = nestedSchema();
  schema.properties.tags.items = { type: 'string' };
  return schema;
}

function syntheticFullKeywordSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'level', 'tags', 'code', 'nested'],
    properties: {
      ok: { type: 'boolean' },
      level: { type: 'string', enum: ['low', 'high'] },
      tags: {
        type: 'array',
        items: { type: 'string', pattern: '^[a-z]+$' },
        minItems: 1,
        uniqueItems: true
      },
      code: { type: 'string', pattern: '^[A-Z]{2}$' },
      nested: {
        type: 'object',
        additionalProperties: false,
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: { type: 'integer' },
            uniqueItems: true
          }
        }
      }
    }
  };
}

export function buildIsolationCases() {
  return [
    { id: 'case-1', label: 'No response_format', introduced: 'baseline', schema: null },
    { id: 'case-2', label: 'Minimal native json_schema', introduced: 'json_schema', schema: minimalSchema() },
    { id: 'case-3', label: 'Add enum', introduced: 'enum', schema: enumSchema() },
    { id: 'case-4', label: 'Add array', introduced: 'array', schema: arraySchema() },
    { id: 'case-5', label: 'Add uniqueItems', introduced: 'uniqueItems', schema: arraySchema({ uniqueItems: true }) },
    { id: 'case-6', label: 'Add pattern', introduced: 'pattern', schema: patternSchema() },
    { id: 'case-7', label: 'Add nested object', introduced: 'nested object', schema: nestedSchema() },
    { id: 'case-8', label: 'Add items', introduced: 'items', schema: itemsSchema() },
    {
      id: 'case-9',
      label: 'Synthetic full UpgradeLens keyword set',
      introduced: 'full keyword set',
      schema: syntheticFullKeywordSchema()
    },
    {
      id: 'case-10',
      label: 'Exact UpgradeLens Version Analysis schema',
      introduced: 'exact UpgradeLens schema',
      schema: clone(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA)
    }
  ];
}

function requiredString(env, name) {
  const value = env?.[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function configuredTimeout(env) {
  const raw = env?.UPGRADELENS_AI_TIMEOUT_MS;
  if (raw === undefined) return DEFAULT_AI_TIMEOUT_MS;
  const timeoutMs = Number(raw);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('UPGRADELENS_AI_TIMEOUT_MS must be a positive integer.');
  }
  return timeoutMs;
}

export function loadIsolationConfiguration(env = process.env) {
  const provider = requiredString(env, 'UPGRADELENS_AI_PROVIDER');
  if (provider !== 'openai-compatible') {
    throw new Error('UPGRADELENS_AI_PROVIDER must be openai-compatible.');
  }
  const endpoint = validateOpenAiCompatibleEndpoint(requiredString(env, 'UPGRADELENS_AI_ENDPOINT'));
  const model = requiredString(env, 'UPGRADELENS_AI_MODEL');
  const authorization = requiredString(env, 'UPGRADELENS_AI_AUTHORIZATION');
  return {
    provider,
    endpoint,
    model,
    authorization,
    timeoutMs: configuredTimeout(env)
  };
}

function requestBody(isolationCase, model) {
  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT }
    ],
    stream: false
  };
  if (isolationCase.schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: isolationCase.id === 'case-10'
          ? 'upgradelens_version_analysis'
          : `upgradelens_isolation_${isolationCase.id.replace('-', '_')}`,
        strict: true,
        schema: clone(isolationCase.schema)
      }
    };
  }
  return body;
}

async function readBoundedResponse(response, maxBytes) {
  const declared = response?.headers?.get?.('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel?.();
    throw Object.assign(new Error('Response exceeded the isolation size limit.'), { code: 'RESPONSE_TOO_LARGE' });
  }
  const reader = response?.body?.getReader?.();
  if (!reader) {
    const text = String(await response.text());
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw Object.assign(new Error('Response exceeded the isolation size limit.'), { code: 'RESPONSE_TOO_LARGE' });
    }
    return text;
  }
  const chunks = [];
  let bytes = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        break;
      }
      const chunk = Buffer.from(value);
      bytes += chunk.length;
      if (bytes > maxBytes) {
        throw Object.assign(new Error('Response exceeded the isolation size limit.'), { code: 'RESPONSE_TOO_LARGE' });
      }
      chunks.push(chunk);
    }
  } finally {
    if (!complete) {
      try {
        await reader.cancel?.();
      } catch {
        // The primary transport/size error is the useful isolation result.
      }
    }
    try {
      reader.releaseLock?.();
    } catch {
      // Releasing a failed stream must not replace the primary result.
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sanitizeIsolationText(value, maxCharacters = 500) {
  return sanitizeDebugText(value, maxCharacters)
    .replaceAll(SYSTEM_PROMPT, '[REDACTED_PROMPT]')
    .replaceAll('You are a JSON generator.', '[REDACTED_PROMPT]')
    .replaceAll(USER_PROMPT, '[REDACTED_PROMPT]');
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function normalizeCanonicalErrorType(value) {
  const normalized = sanitizeIsolationText(value, 128).toLowerCase();
  if (!normalized) return null;
  return CANONICAL_ERROR_TYPES.has(normalized) ? normalized : 'unmapped';
}

export function parseCanonicalProbeError(value) {
  let payload = value;
  if (typeof value === 'string') {
    try {
      payload = JSON.parse(value);
    } catch {
      return Object.freeze({});
    }
  }
  const error = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload.error
    : null;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return Object.freeze({});
  const metadata = error.metadata && typeof error.metadata === 'object' && !Array.isArray(error.metadata)
    ? error.metadata
    : {};
  const errorType = normalizeCanonicalErrorType(metadata.error_type);
  return Object.freeze(Object.fromEntries(Object.entries({
    code: sanitizeIsolationText(error.code, 128),
    message: sanitizeIsolationText(error.message),
    errorType,
    providerCode: sanitizeIsolationText(metadata.provider_code, 128)
  }).filter(([, field]) => field !== null && field !== '')));
}

function summarizeRouterMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const endpoints = value.endpoints && typeof value.endpoints === 'object' && !Array.isArray(value.endpoints)
    ? value.endpoints
    : {};
  const available = Array.isArray(endpoints.available) ? endpoints.available : [];
  const selectedProviders = [...new Set(available
    .filter((endpoint) => endpoint && typeof endpoint === 'object' && endpoint.selected === true)
    .map((endpoint) => sanitizeIsolationText(endpoint.provider, 128))
    .filter(Boolean))].sort();
  const pipeline = Array.isArray(value.pipeline)
    ? value.pipeline.slice(0, 32).map((stage) => Object.fromEntries(Object.entries({
      type: sanitizeIsolationText(stage?.type, 128),
      name: sanitizeIsolationText(stage?.name, 128),
      summary: typeof stage?.summary === 'string' ? sanitizeIsolationText(stage.summary) : ''
    }).filter(([, field]) => field !== ''))).filter((stage) => Object.keys(stage).length > 0)
    : [];
  const total = Number.isSafeInteger(endpoints.total) && endpoints.total >= 0 ? endpoints.total : null;
  const attempt = Number.isSafeInteger(value.attempt) && value.attempt >= 0 ? value.attempt : null;
  const summary = Object.fromEntries(Object.entries({
    requestedModel: sanitizeIsolationText(value.requested, 256),
    strategy: sanitizeIsolationText(value.strategy, 128),
    attempt,
    selectedProviders,
    endpointCount: total,
    availableEndpointCount: available.length,
    pipeline
  }).filter(([, field]) => field !== null && field !== '' && (!Array.isArray(field) || field.length > 0)));
  return Object.keys(summary).length > 0 ? Object.freeze(summary) : null;
}

function parseEnvelopeDiagnostics(text) {
  try {
    const payload = JSON.parse(text);
    return {
      providerError: parseCanonicalProbeError(payload),
      routingMetadata: summarizeRouterMetadata(payload?.openrouter_metadata)
    };
  } catch {
    return { providerError: Object.freeze({}), routingMetadata: null };
  }
}

function schemaKeywordCounts(schema) {
  const counts = Object.fromEntries(SCHEMA_KEYWORD_ALLOWLIST.map((keyword) => [keyword, 0]));
  const seen = new WeakSet();
  function visit(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(counts, key)) counts[key] += 1;
      visit(child);
    }
  }
  visit(schema);
  return counts;
}

function normalizedMessageContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (typeof part === 'string') return part;
    if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
    return '';
  }).join('');
}

function safeTopLevelKeys(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.keys(body)
    .filter((key) => !/(?:authorization|api.?key|credential|secret|token|cookie|billing|account)/i.test(key))
    .sort()
    .map((key) => sanitizeIsolationText(key, 128));
}

export function summarizeRequestStructure(body) {
  const messages = Array.isArray(body?.messages)
    ? body.messages
    : (Array.isArray(body?.input) ? body.input : []);
  const responseFormat = body?.response_format ?? body?.text?.format;
  const jsonSchema = responseFormat?.json_schema ?? responseFormat;
  const schema = jsonSchema?.schema;
  const schemaDiagnostics = schema && typeof schema === 'object' ? buildSchemaDiagnostics(schema) : null;
  const summary = {
    model: sanitizeIsolationText(body?.model, 256),
    stream: body?.stream === true,
    messageCount: messages.length,
    messageRoles: messages.map((message) => sanitizeIsolationText(message?.role, 32)),
    messageCharacterCounts: messages.map((message) => normalizedMessageContent(message?.content).length),
    messageDigests: messages.map((message) => sha256(normalizedMessageContent(message?.content))),
    responseFormatType: sanitizeIsolationText(responseFormat?.type, 128),
    schemaName: sanitizeIsolationText(jsonSchema?.name, 128),
    strict: jsonSchema?.strict === true,
    schemaDigest: schemaDiagnostics?.schemaDigest ?? null,
    schemaBytes: schemaDiagnostics?.schemaBytes ?? 0,
    schemaKeywordCounts: schema ? schemaKeywordCounts(schema) : {},
    transformedTopLevelKeys: safeTopLevelKeys(body)
  };
  return Object.freeze({ structuralDigest: sha256(JSON.stringify(summary)), ...summary });
}

function compareRequestStructures(original, transformed) {
  if (!transformed) return null;
  const keywords = new Set([
    ...Object.keys(original.schemaKeywordCounts),
    ...Object.keys(transformed.schemaKeywordCounts)
  ]);
  const keywordDeltas = Object.fromEntries([...keywords].sort().map((keyword) => [
    keyword,
    (transformed.schemaKeywordCounts[keyword] ?? 0) - (original.schemaKeywordCounts[keyword] ?? 0)
  ]).filter(([, delta]) => delta !== 0));
  return Object.freeze({
    modelChanged: original.model !== transformed.model,
    responseFormatPreserved: original.responseFormatType === transformed.responseFormatType,
    strictPreserved: original.strict === transformed.strict,
    schemaDigestChanged: original.schemaDigest !== transformed.schemaDigest,
    keywordDeltas,
    addedTopLevelKeys: transformed.transformedTopLevelKeys.filter((key) => !original.transformedTopLevelKeys.includes(key)),
    removedTopLevelKeys: original.transformedTopLevelKeys.filter((key) => !transformed.transformedTopLevelKeys.includes(key)),
    messageCountPreserved: original.messageCount === transformed.messageCount,
    messageRolesPreserved: JSON.stringify(original.messageRoles) === JSON.stringify(transformed.messageRoles)
  });
}

function markdownCell(value) {
  return sanitizeIsolationText(value).replaceAll('|', '\\|');
}

export function classifyIsolationHttpError(status, providerError = {}) {
  const descriptor = Object.values(providerError).join(' ').toLowerCase();
  const schema = /json[_ -]?schema|response[_ -]?format|structured[_ -]?output|schema/.test(descriptor);
  const unsupported = /unsupported|not[_ -]?supported|does[_ -]?not[_ -]?support|unknown[_ -]?(?:field|parameter)|unrecognized/.test(descriptor);
  const modelMissing = /model[_ -]?not[_ -]?found|no such model|unknown model|model does not exist/.test(descriptor);
  if (status === 401) return 'AUTH_ERROR';
  if (status === 402) return 'INSUFFICIENT_CREDIT';
  if (status === 403) return 'ACCESS_DENIED';
  if (status === 404 && modelMissing) return 'MODEL_NOT_FOUND';
  if (status === 408 || status === 504) return 'TIMEOUT';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 502 || status === 503) return 'PROVIDER_UNAVAILABLE';
  if (status === 400 || status === 422) {
    if (schema && unsupported) return 'STRUCTURED_OUTPUT_UNSUPPORTED';
    if (schema) return 'SCHEMA_REJECTED';
    return 'INVALID_REQUEST';
  }
  return 'PROVIDER_ERROR';
}

function safeEndpoint(url) {
  return { protocol: url.protocol, hostname: url.hostname, pathname: url.pathname };
}

async function executeIsolationCase(isolationCase, config, {
  fetchImplementation,
  clock,
  maxResponseBytes,
  includeRouterMetadata = false
}) {
  const body = requestBody(isolationCase, config.model);
  const serializedBody = JSON.stringify(body);
  const schemaDiagnostics = isolationCase.schema ? buildSchemaDiagnostics(isolationCase.schema) : null;
  const startedAt = clock.now();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);
  let response;
  let responseText = '';
  try {
    response = await fetchImplementation(config.endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: config.authorization,
        ...(includeRouterMetadata ? { 'x-openrouter-metadata': 'enabled' } : {})
      },
      body: serializedBody,
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal
    });
    responseText = await readBoundedResponse(response, maxResponseBytes);
  } catch (error) {
    const runtimeCode = timedOut ? 'TIMEOUT' : (error?.code ?? 'NETWORK_ERROR');
    return {
      case: isolationCase.id,
      label: isolationCase.label,
      introduced: isolationCase.introduced,
      schemaDigest: schemaDiagnostics?.schemaDigest ?? null,
      schemaBytes: schemaDiagnostics?.schemaBytes ?? 0,
      httpStatus: null,
      runtimeCode,
      provider: config.provider,
      model: sanitizeDebugText(config.model, 256),
      latencyMs: Math.max(0, clock.now() - startedAt),
      requestBytes: Buffer.byteLength(serializedBody, 'utf8'),
      responseBytes: 0,
      pass: false,
      providerError: {},
      errorType: null,
      providerCode: null,
      routingMetadata: null,
      attemptCount: 1,
      retryCount: 0,
      fallbackCount: 0
    };
  } finally {
    clearTimeout(timer);
  }

  const pass = response.status >= 200 && response.status < 300;
  const envelope = parseEnvelopeDiagnostics(responseText);
  const providerError = pass ? {} : envelope.providerError;
  return {
    case: isolationCase.id,
    label: isolationCase.label,
    introduced: isolationCase.introduced,
    schemaDigest: schemaDiagnostics?.schemaDigest ?? null,
    schemaBytes: schemaDiagnostics?.schemaBytes ?? 0,
    httpStatus: response.status,
    runtimeCode: pass ? 'SUCCESS' : classifyIsolationHttpError(response.status, providerError),
    provider: config.provider,
    model: sanitizeDebugText(config.model, 256),
    latencyMs: Math.max(0, clock.now() - startedAt),
    requestBytes: Buffer.byteLength(serializedBody, 'utf8'),
    responseBytes: Buffer.byteLength(responseText, 'utf8'),
    pass,
    providerError,
    errorType: providerError.errorType ?? null,
    providerCode: providerError.providerCode ?? null,
    routingMetadata: envelope.routingMetadata,
    attemptCount: 1,
    retryCount: 0,
    fallbackCount: 0
  };
}

export function isolationConclusion(results) {
  if (results.every((result) => result.pass)) {
    return 'All isolation schemas passed. The earlier HTTP 400 was not reproduced by structured-output shape alone.';
  }
  if (!results[0]?.pass) {
    return 'The no-response_format baseline failed, so structured-output compatibility cannot be isolated from transport or upstream routing.';
  }
  const firstFailure = results.findIndex((result) => !result.pass);
  if (firstFailure === 1) {
    return 'The first native json_schema case failed after the baseline passed, indicating native response_format compatibility as the leading boundary.';
  }
  if (firstFailure === 9 && results.slice(1, 9).every((result) => result.pass)) {
    return 'Cases 2–9 passed and only the exact UpgradeLens schema failed, isolating the incompatibility to the exact schema shape rather than basic json_schema support.';
  }
  if (firstFailure === 3) {
    return 'Case 4 is the first failure at the array schema shape. Because that case intentionally declares an array without items and OpenRouter returned only a generic HTTP 400, this run cannot distinguish rejection of the array keyword from a requirement that every array declare items. Later cases are cumulative and therefore do not prove a single causal keyword.';
  }
  const failure = results[firstFailure];
  const earlierPass = results.slice(0, firstFailure).every((result) => result.pass);
  const laterAllFail = results.slice(firstFailure).every((result) => !result.pass);
  if (earlierPass && laterAllFail) {
    return `${failure.label} is the first cumulative failure; ${failure.introduced} is the leading compatibility boundary, subject to upstream routing variability.`;
  }
  return 'Results are non-monotonic, so no single schema keyword can be isolated; upstream routing variability or multiple compatibility constraints remain possible.';
}

export function serializeCompatibilityReport({ config, results, generatedAt = new Date() }) {
  const endpoint = safeEndpoint(config.endpoint);
  const lines = [
    '# Structured Output Compatibility Report',
    '',
    'Execution status: EXECUTED',
    '',
    '## Configuration',
    '',
    `- Generated: ${generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt}`,
    `- Provider: ${sanitizeIsolationText(config.provider, 128)}`,
    `- Model: ${sanitizeIsolationText(config.model, 256)}`,
    `- Endpoint: ${endpoint.protocol}//${endpoint.hostname}${endpoint.pathname}`,
    '- Prompt: fixed minimal isolation prompt; content intentionally omitted.',
    '- Retry/fallback: disabled (one request per case).',
    '',
    '## Results',
    '',
    '| Case | Change | Schema digest | Schema bytes | Request bytes | Response bytes | HTTP | Runtime code | Latency | PASS | Notes |',
    '|---|---|---|---:|---:|---:|---:|---|---:|---|---|'
  ];
  for (const result of results) {
    const note = Object.entries(result.providerError)
      .map(([key, value]) => `${markdownCell(key)}=${markdownCell(value)}`)
      .join('; ');
    lines.push(`| ${markdownCell(result.case)} | ${markdownCell(result.label)} | ${markdownCell(result.schemaDigest ?? 'none')} | ${result.schemaBytes} | ${result.requestBytes} | ${result.responseBytes} | ${result.httpStatus ?? 'none'} | ${markdownCell(result.runtimeCode)} | ${result.latencyMs} ms | ${result.pass ? 'PASS' : 'FAIL'} | ${note || '—'} |`);
  }
  lines.push(
    '',
    '## Conclusion',
    '',
    isolationConclusion(results),
    '',
    'A single request was sent for each case. UpgradeLens performed no retry or fallback. OpenRouter may still make upstream routing attempts that are not visible in this report.',
    '',
    '## Security',
    '',
    'The report excludes Authorization, API keys, prompt content, raw provider responses, headers, cookies, account data, and billing metadata.',
    '',
    `Total OpenRouter requests: ${results.length}`,
    ''
  );
  return lines.join('\n');
}

export async function runStructuredOutputIsolation(config, {
  cases = buildIsolationCases(),
  fetchImplementation = globalThis.fetch,
  clock = Date,
  maxResponseBytes = DEFAULT_AI_MAX_RESPONSE_BYTES,
  onResult
} = {}) {
  if (typeof fetchImplementation !== 'function') throw new TypeError('fetchImplementation must be a function.');
  if (!Array.isArray(cases) || cases.length === 0) throw new TypeError('Isolation cases are required.');
  const results = [];
  for (const isolationCase of cases) {
    const result = await executeIsolationCase(isolationCase, config, {
      fetchImplementation,
      clock,
      maxResponseBytes
    });
    results.push(result);
    onResult?.(structuredClone(result));
  }
  return results;
}

function skippedProbe(probe, status, reason, duplicateOf = null) {
  const diagnostics = buildSchemaDiagnostics(probe.schema);
  return Object.freeze({
    case: probe.id,
    label: probe.label,
    introduced: probe.introduced,
    feature: probe.feature,
    schemaDigest: diagnostics.schemaDigest,
    schemaBytes: diagnostics.schemaBytes,
    httpStatus: null,
    runtimeCode: status,
    pass: false,
    executed: false,
    skipReason: reason,
    duplicateOf,
    providerError: {},
    errorType: null,
    providerCode: null,
    routingMetadata: null,
    attemptCount: 0,
    retryCount: 0,
    fallbackCount: 0
  });
}

function confirmedIncompatibleKeywords(results) {
  const byId = new Map(results.map((result) => [result.case, result]));
  const keywords = [];
  if (byId.get('probe-a')?.pass && byId.get('probe-b')?.executed && !byId.get('probe-b')?.pass) {
    keywords.push('uniqueItems');
  }
  if (byId.get('probe-c')?.executed && !byId.get('probe-c')?.pass) keywords.push('pattern');
  return keywords;
}

function remediationProven(probe, result, results) {
  if (!result.pass) return false;
  const incompatible = confirmedIncompatibleKeywords(results);
  if (incompatible.length === 0) return false;
  const removed = new Set(probe.removedKeywords ?? []);
  return incompatible.every((keyword) => removed.has(keyword));
}

export async function runIndependentProbes(config, {
  probes = buildIndependentProbes(),
  fetchImplementation = globalThis.fetch,
  clock = Date,
  maxResponseBytes = DEFAULT_AI_MAX_RESPONSE_BYTES,
  maxRequests = MAX_REAL_PROBE_REQUESTS,
  onResult
} = {}) {
  if (!Number.isSafeInteger(maxRequests) || maxRequests <= 0 || maxRequests > MAX_REAL_PROBE_REQUESTS) {
    throw new TypeError(`maxRequests must be between 1 and ${MAX_REAL_PROBE_REQUESTS}.`);
  }
  const byId = new Map(probes.map((probe) => [probe.id, probe]));
  const requiredIds = ['baseline', 'probe-a', 'probe-b', 'probe-c', 'probe-d', 'probe-e', 'probe-f', 'probe-g', 'probe-h', 'probe-i', 'probe-j'];
  if (byId.size !== probes.length || requiredIds.some((id) => !byId.has(id))) {
    throw new TypeError('Independent probe matrix is incomplete or contains duplicate ids.');
  }
  const results = [];
  const seenDigests = new Map();
  let requestCount = 0;
  let earlyStop = false;

  async function run(id) {
    const probe = byId.get(id);
    const digest = buildSchemaDiagnostics(probe.schema).schemaDigest;
    if (seenDigests.has(digest)) {
      const skipped = skippedProbe(probe, 'SKIPPED_DUPLICATE', 'Schema digest already executed.', seenDigests.get(digest));
      results.push(skipped);
      onResult?.(structuredClone(skipped));
      return skipped;
    }
    if (requestCount >= maxRequests) {
      const skipped = skippedProbe(probe, 'SKIPPED_BUDGET', 'Real request budget exhausted.');
      results.push(skipped);
      onResult?.(structuredClone(skipped));
      return skipped;
    }
    seenDigests.set(digest, id);
    requestCount += 1;
    const result = await executeIsolationCase(probe, config, {
      fetchImplementation,
      clock,
      maxResponseBytes,
      includeRouterMetadata: true
    });
    const normalized = Object.freeze({ ...result, feature: probe.feature, executed: true, skipReason: null, duplicateOf: null });
    results.push(normalized);
    onResult?.(structuredClone(normalized));
    return normalized;
  }

  function skip(id, reason) {
    const skipped = skippedProbe(byId.get(id), 'SKIPPED_POLICY', reason);
    results.push(skipped);
    onResult?.(structuredClone(skipped));
    return skipped;
  }

  await run('baseline');
  const array = await run('probe-a');
  if (array.pass) {
    await run('probe-b');
    await run('probe-f');
  } else {
    skip('probe-b', 'Array with items failed; dependent uniqueItems probe was not meaningful.');
    skip('probe-f', 'Array with items failed; dependent minItems probe was not meaningful.');
  }
  await run('probe-c');
  const nested = await run('probe-d');
  if (array.pass && nested.pass) await run('probe-e');
  else skip('probe-e', 'Array-of-objects prerequisites did not both pass.');

  for (const id of ['probe-g', 'probe-h', 'probe-i']) {
    if (earlyStop) {
      skip(id, 'A causal keyword and passing exact-schema remediation candidate were already established.');
      continue;
    }
    const probe = byId.get(id);
    const result = await run(id);
    if (remediationProven(probe, result, results)) earlyStop = true;
  }
  const projectionDigest = buildSchemaDiagnostics(byId.get('probe-j').schema).schemaDigest;
  const projectionDuplicate = ['probe-i', 'probe-h', 'probe-g']
    .find((id) => buildSchemaDiagnostics(byId.get(id).schema).schemaDigest === projectionDigest);
  if (projectionDuplicate) {
    const skipped = skippedProbe(
      byId.get('probe-j'),
      'SKIPPED_DUPLICATE',
      'Schema digest duplicates an exact-schema variant.',
      projectionDuplicate
    );
    results.push(skipped);
    onResult?.(structuredClone(skipped));
  } else {
    await run('probe-j');
  }

  return Object.freeze({
    results: Object.freeze(results),
    requestCount,
    earlyStop,
    maxRequests
  });
}

function consumeSsePayload(payload, state) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  const upstreamBody = payload.debug?.echo_upstream_body;
  if (!state.upstreamSummary && upstreamBody && typeof upstreamBody === 'object' && !Array.isArray(upstreamBody)) {
    state.upstreamSummary = summarizeRequestStructure(upstreamBody);
  }
  if (payload.error) state.providerError = parseCanonicalProbeError(payload);
  for (const choice of Array.isArray(payload.choices) ? payload.choices : []) {
    const reason = sanitizeIsolationText(choice?.finish_reason, 128);
    if (reason) state.finishReasons.add(reason);
  }
  const routing = summarizeRouterMetadata(payload.openrouter_metadata);
  if (routing) state.routingMetadata = routing;
}

export async function parseOpenRouterDebugSse(stream, {
  maxBytes = DEFAULT_AI_MAX_RESPONSE_BYTES
} = {}) {
  if (!stream?.getReader) throw new TypeError('A readable SSE stream is required.');
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const state = {
    upstreamSummary: null,
    providerError: Object.freeze({}),
    routingMetadata: null,
    finishReasons: new Set(),
    malformedLineCount: 0,
    doneObserved: false,
    responseBytes: 0
  };
  let buffer = '';
  let complete = false;
  function processLine(line) {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (!normalized.startsWith('data:')) return;
    const data = normalized.slice(5).trimStart();
    if (data === '[DONE]') {
      state.doneObserved = true;
      return;
    }
    try {
      consumeSsePayload(JSON.parse(data), state);
    } catch {
      state.malformedLineCount += 1;
    }
  }
  try {
    while (!state.doneObserved) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        break;
      }
      state.responseBytes += value.byteLength;
      if (state.responseBytes > maxBytes) {
        throw Object.assign(new Error('Debug SSE exceeded the isolation size limit.'), { code: 'RESPONSE_TOO_LARGE' });
      }
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        processLine(line);
        if (state.doneObserved) break;
      }
    }
    if (!state.doneObserved) {
      buffer += decoder.decode();
      if (buffer.length > 0) processLine(buffer);
    }
  } finally {
    if (!complete) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the primary parse, timeout, or size result.
      }
    }
    try {
      reader.releaseLock();
    } catch {
      // A failed stream can already have released its reader.
    }
  }
  return Object.freeze({
    upstreamSummary: state.upstreamSummary,
    providerError: state.providerError,
    routingMetadata: state.routingMetadata,
    finishReasons: Object.freeze([...state.finishReasons].sort()),
    malformedLineCount: state.malformedLineCount,
    doneObserved: state.doneObserved,
    responseBytes: state.responseBytes
  });
}

function debugRequestBody(probe, model) {
  return {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: `upgradelens_debug_${probe.id.replace('-', '_')}`,
        strict: true,
        schema: clone(probe.schema)
      }
    },
    stream: true,
    debug: { echo_upstream_body: true }
  };
}

function inferDebugOrigin(upstreamSummary, routingMetadata) {
  if (upstreamSummary) return 'CONFIRMED_UPSTREAM_BODY_OBSERVED';
  if ((routingMetadata?.selectedProviders?.length ?? 0) > 0 || (routingMetadata?.attempt ?? 0) > 0) {
    return 'LIKELY_UPSTREAM_REJECTION';
  }
  return 'INCONCLUSIVE_PRE_OR_UPSTREAM';
}

async function executeUpstreamDebugProbe(probe, config, {
  fetchImplementation,
  maxResponseBytes,
  clock
}) {
  const body = debugRequestBody(probe, config.model);
  const original = summarizeRequestStructure(body);
  const serializedBody = JSON.stringify(body);
  const controller = new AbortController();
  let timedOut = false;
  const startedAt = clock.now();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);
  try {
    const response = await fetchImplementation(config.endpoint, {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        authorization: config.authorization,
        'x-openrouter-metadata': 'enabled'
      },
      body: serializedBody,
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal
    });
    if (response.status < 200 || response.status >= 300) {
      const text = await readBoundedResponse(response, maxResponseBytes);
      const diagnostics = parseEnvelopeDiagnostics(text);
      return Object.freeze({
        probe: probe.id,
        label: probe.label,
        httpStatus: response.status,
        pass: false,
        runtimeCode: classifyIsolationHttpError(response.status, diagnostics.providerError),
        latencyMs: Math.max(0, clock.now() - startedAt),
        requestBytes: Buffer.byteLength(serializedBody, 'utf8'),
        responseBytes: Buffer.byteLength(text, 'utf8'),
        providerError: diagnostics.providerError,
        errorType: diagnostics.providerError.errorType ?? null,
        providerCode: diagnostics.providerError.providerCode ?? null,
        routingMetadata: diagnostics.routingMetadata,
        original,
        upstreamTransformed: null,
        comparison: null,
        debugEchoObserved: false,
        doneObserved: false,
        malformedLineCount: 0,
        finishReasons: [],
        originAssessment: inferDebugOrigin(null, diagnostics.routingMetadata),
        attemptCount: 1,
        retryCount: 0,
        fallbackCount: 0
      });
    }
    const parsed = await parseOpenRouterDebugSse(response.body, { maxBytes: maxResponseBytes });
    const providerError = parsed.providerError;
    const pass = Object.keys(providerError).length === 0;
    return Object.freeze({
      probe: probe.id,
      label: probe.label,
      httpStatus: response.status,
      pass,
      runtimeCode: pass ? 'SUCCESS' : classifyIsolationHttpError(Number(providerError.code) || 500, providerError),
      latencyMs: Math.max(0, clock.now() - startedAt),
      requestBytes: Buffer.byteLength(serializedBody, 'utf8'),
      responseBytes: parsed.responseBytes,
      providerError,
      errorType: providerError.errorType ?? null,
      providerCode: providerError.providerCode ?? null,
      routingMetadata: parsed.routingMetadata,
      original,
      upstreamTransformed: parsed.upstreamSummary,
      comparison: compareRequestStructures(original, parsed.upstreamSummary),
      debugEchoObserved: Boolean(parsed.upstreamSummary),
      doneObserved: parsed.doneObserved,
      malformedLineCount: parsed.malformedLineCount,
      finishReasons: parsed.finishReasons,
      originAssessment: inferDebugOrigin(parsed.upstreamSummary, parsed.routingMetadata),
      attemptCount: 1,
      retryCount: 0,
      fallbackCount: 0
    });
  } catch (error) {
    return Object.freeze({
      probe: probe.id,
      label: probe.label,
      httpStatus: null,
      pass: false,
      runtimeCode: timedOut ? 'TIMEOUT' : (error?.code ?? 'NETWORK_ERROR'),
      latencyMs: Math.max(0, clock.now() - startedAt),
      requestBytes: Buffer.byteLength(serializedBody, 'utf8'),
      responseBytes: 0,
      providerError: {},
      errorType: null,
      providerCode: null,
      routingMetadata: null,
      original,
      upstreamTransformed: null,
      comparison: null,
      debugEchoObserved: false,
      doneObserved: false,
      malformedLineCount: 0,
      finishReasons: [],
      originAssessment: 'INCONCLUSIVE_PRE_OR_UPSTREAM',
      attemptCount: 1,
      retryCount: 0,
      fallbackCount: 0
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function runOpenRouterUpstreamDebug(config, probeRun, {
  probes = buildIndependentProbes(),
  fetchImplementation = globalThis.fetch,
  maxResponseBytes = DEFAULT_AI_MAX_RESPONSE_BYTES,
  clock = Date,
  includeBaseline = true,
  onResult
} = {}) {
  const byId = new Map(probes.map((probe) => [probe.id, probe]));
  const executed = new Map(probeRun.results.filter((result) => result.executed).map((result) => [result.case, result]));
  const selected = [];
  if (includeBaseline && executed.get('baseline')?.pass) selected.push(byId.get('baseline'));
  const failedExactId = ['probe-i', 'probe-h', 'probe-g'].find((id) => executed.get(id) && !executed.get(id).pass);
  if (failedExactId) selected.push(byId.get(failedExactId));
  else selected.push({
    id: 'exact-schema',
    label: 'Exact UpgradeLens Version Analysis schema',
    schema: clone(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA)
  });
  const unique = [];
  const seen = new Set();
  for (const probe of selected) {
    const digest = buildSchemaDiagnostics(probe.schema).schemaDigest;
    if (!seen.has(digest) && unique.length < MAX_DEBUG_REQUESTS) {
      seen.add(digest);
      unique.push(probe);
    }
  }
  const results = [];
  for (const probe of unique) {
    const result = await executeUpstreamDebugProbe(probe, config, {
      fetchImplementation,
      maxResponseBytes,
      clock
    });
    results.push(result);
    onResult?.(structuredClone(result));
  }
  return Object.freeze({ results: Object.freeze(results), requestCount: results.length, maxRequests: MAX_DEBUG_REQUESTS });
}

function featureConclusion(result, supportedLabel, incompatibleLabel) {
  if (!result?.executed) return `INCONCLUSIVE — ${result?.skipReason ?? 'probe was not executed'}`;
  return result.pass
    ? `CONFIRMED — ${supportedLabel}`
    : `CONFIRMED — ${incompatibleLabel}`;
}

export function buildCausalConclusions(probeResults) {
  const byId = new Map(probeResults.map((result) => [result.case, result]));
  const array = byId.get('probe-a');
  const unique = byId.get('probe-b');
  let uniqueItems;
  if (array?.pass && unique?.executed) {
    uniqueItems = unique.pass
      ? 'CONFIRMED — uniqueItems is supported in the independent array control.'
      : 'CONFIRMED — uniqueItems is incompatible because Probe A passed and otherwise-identical Probe B failed.';
  } else {
    uniqueItems = 'INCONCLUSIVE — the prerequisite array-with-items control did not pass.';
  }
  const variants = ['probe-g', 'probe-h', 'probe-i']
    .map((id) => byId.get(id))
    .filter((result) => result?.executed);
  const passingVariant = variants.find((result) => result.pass);
  const exactSchema = passingVariant
    ? `LIKELY — ${passingVariant.label} passed and is a provider-facing remediation candidate; the unchanged local schema remains authoritative.`
    : 'INCONCLUSIVE — no executed reduced exact-schema variant passed; another keyword or schema-composition constraint remains.';
  return Object.freeze({
    arrayWithItems: featureConclusion(array, 'array with items is supported.', 'array with items is incompatible for this route/model.'),
    uniqueItems,
    pattern: featureConclusion(byId.get('probe-c'), 'pattern is supported.', 'pattern is incompatible in an otherwise minimal schema.'),
    nestedObject: featureConclusion(byId.get('probe-d'), 'nested strict objects are supported.', 'nested strict objects are incompatible.'),
    arrayOfObjects: featureConclusion(byId.get('probe-e'), 'arrays of strict nested objects are supported.', 'arrays of strict nested objects are incompatible.'),
    minItems: featureConclusion(byId.get('probe-f'), 'minItems is supported.', 'minItems is incompatible in an otherwise minimal array schema.'),
    exactSchema
  });
}

function reportValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.length > 0 ? value.map((item) => markdownCell(item)).join(', ') : '[]';
  if (typeof value === 'object') return markdownCell(JSON.stringify(value));
  return markdownCell(value);
}

function debugFieldRows(result) {
  const original = result.original;
  const upstream = result.upstreamTransformed;
  if (result.structuralSummaryIncomplete) {
    return [
      `| ${markdownCell(result.probe)} / Structural digest | ${reportValue(original?.structuralDigest)} | ${reportValue(upstream?.structuralDigest)} |`,
      `| ${markdownCell(result.probe)} / Model | ${reportValue(original?.model)} | ${reportValue(upstream?.model)} |`,
      `| ${markdownCell(result.probe)} / Top-level keys | ${reportValue(original?.transformedTopLevelKeys)} | ${reportValue(upstream?.transformedTopLevelKeys)} |`,
      `| ${markdownCell(result.probe)} / Nested input and text.format | Present in transformed top-level shape | INCONCLUSIVE — not decoded in the first safe summary |`
    ];
  }
  const fields = [
    ['Structural digest', original?.structuralDigest, upstream?.structuralDigest],
    ['Model', original?.model, upstream?.model],
    ['Stream', original?.stream, upstream?.stream],
    ['Message count', original?.messageCount, upstream?.messageCount],
    ['Message roles', original?.messageRoles, upstream?.messageRoles],
    ['Message character counts', original?.messageCharacterCounts, upstream?.messageCharacterCounts],
    ['Message digests', original?.messageDigests, upstream?.messageDigests],
    ['Response format type', original?.responseFormatType, upstream?.responseFormatType],
    ['Schema name', original?.schemaName, upstream?.schemaName],
    ['Strict', original?.strict, upstream?.strict],
    ['Schema digest', original?.schemaDigest, upstream?.schemaDigest],
    ['Schema bytes', original?.schemaBytes, upstream?.schemaBytes],
    ['Schema keyword counts', original?.schemaKeywordCounts, upstream?.schemaKeywordCounts],
    ['Top-level keys', original?.transformedTopLevelKeys, upstream?.transformedTopLevelKeys]
  ];
  return fields.map(([field, left, right]) => `| ${markdownCell(result.probe)} / ${field} | ${reportValue(left)} | ${reportValue(right)} |`);
}

export function serializeIndependentReport({
  config,
  probeRun,
  debugRun = { results: [], requestCount: 0 },
  generatedAt = new Date()
}) {
  const endpoint = safeEndpoint(config.endpoint);
  const conclusions = { ...buildCausalConclusions(probeRun.results) };
  const exactDebug = debugRun.results.find((result) => result.probe === 'exact-schema');
  const exactWithoutUniqueItems = probeRun.results.find((result) => result.case === 'probe-g');
  const uniqueItemsProbe = probeRun.results.find((result) => result.case === 'probe-b');
  const uniqueItemsRemediationConfirmed = exactDebug && !exactDebug.pass
    && exactWithoutUniqueItems?.pass
    && uniqueItemsProbe?.executed
    && !uniqueItemsProbe.pass;
  if (uniqueItemsRemediationConfirmed) {
    conclusions.exactSchema = 'CONFIRMED — the unchanged exact schema was rejected while the exact clone with only uniqueItems removed passed.';
  }
  const totalRequests = probeRun.requestCount + debugRun.requestCount;
  const lines = [
    '# Structured Output Compatibility Report',
    '',
    'Execution status: EXECUTED',
    '',
    '## Configuration',
    '',
    `- Generated: ${generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt}`,
    `- Provider: ${sanitizeIsolationText(config.provider, 128)}`,
    `- Model: ${sanitizeIsolationText(config.model, 256)}`,
    `- Endpoint: ${endpoint.protocol}//${endpoint.hostname}${endpoint.pathname}`,
    '- Prompt: fixed minimal isolation prompt; content intentionally omitted.',
    '- Retry/fallback: disabled (one request per executed probe).',
    '',
    '## Documentation Findings',
    '',
    '- OpenRouter errors use an `error` envelope; canonical `error.metadata.error_type` takes precedence over HTTP status, and `error.metadata.provider_code` may retain the upstream code.',
    '- `debug.echo_upstream_body = true` returns the transformed upstream request only on a streaming request. The echoed body is privacy-sensitive and is summarized structurally here, never stored raw.',
    '- Routing context was requested only in this isolation path with the current `X-OpenRouter-Metadata: enabled` header.',
    '- Official references: https://openrouter.ai/docs/api/reference/errors-and-debugging and https://openrouter.ai/docs/guides/features/router-metadata',
    '',
    '## Independent Keyword Probes',
    '',
    '| Probe | Isolated feature | Schema digest | HTTP | error_type | Provider code | Result |',
    '|---|---|---|---:|---|---|---|'
  ];
  for (const result of probeRun.results) {
    lines.push(`| ${markdownCell(result.case)} | ${markdownCell(result.introduced)} | ${markdownCell(result.schemaDigest)} | ${result.httpStatus ?? '—'} | ${reportValue(result.errorType)} | ${reportValue(result.providerCode)} | ${result.executed ? (result.pass ? 'PASS' : 'FAIL') : markdownCell(result.runtimeCode)} |`);
  }
  lines.push(
    '',
    '## Canonical Error Diagnostics',
    '',
    '| Probe | HTTP | error_type | Provider code | Allowlisted message | Routing summary |',
    '|---|---:|---|---|---|---|'
  );
  for (const result of probeRun.results.filter((item) => item.executed && !item.pass)) {
    lines.push(`| ${markdownCell(result.case)} | ${result.httpStatus ?? '—'} | ${reportValue(result.errorType)} | ${reportValue(result.providerCode)} | ${reportValue(result.providerError?.message)} | ${reportValue(result.routingMetadata)} |`);
  }
  lines.push(
    '',
    '## OpenRouter Upstream Debug',
    '',
    '| Probe | HTTP | Echo observed | Origin assessment | error_type | Provider code | Notes |',
    '|---|---:|---|---|---|---|---|'
  );
  for (const result of debugRun.results) {
    lines.push(`| ${markdownCell(result.probe)} | ${result.httpStatus ?? '—'} | ${result.debugEchoObserved ? 'YES' : 'NO'} | ${markdownCell(result.originAssessment)} | ${reportValue(result.errorType)} | ${reportValue(result.providerCode)} | ${reportValue(result.note)} |`);
  }
  lines.push(
    '',
    '| Field | Original | Upstream transformed |',
    '|---|---|---|'
  );
  if (debugRun.results.length === 0) lines.push('| No debug probe executed | — | — |');
  else for (const result of debugRun.results) lines.push(...debugFieldRows(result));
  lines.push('', '## Transformation Comparison', '');
  for (const result of debugRun.results) {
    lines.push(`- ${markdownCell(result.probe)}: ${result.comparison ? reportValue(result.comparison) : reportValue(result.note ?? 'No upstream body was exposed; transformation comparison is unavailable.')}`);
  }
  if (debugRun.results.length === 0) lines.push('- No upstream debug result.');
  lines.push('', '## Causal Conclusion', '');
  for (const [feature, conclusion] of Object.entries(conclusions)) {
    lines.push(`- ${feature}: ${conclusion}`);
  }
  lines.push(
    '',
    '## Recommended Production Fix',
    '',
    uniqueItemsRemediationConfirmed
      ? 'Create a separately reviewed provider-facing generation schema projection that recursively removes only `uniqueItems`. Keep `pattern`, `minItems`, the unchanged candidate schema, and local Ajv validation; local validation remains authoritative for uniqueness and the full output contract. Do not implement that production change in RT-02D.'
      : 'Do not change the candidate schema from this report alone. If a reduced exact-schema variant passes with causal keyword evidence, introduce a separately reviewed provider-facing generation schema projection while retaining the unchanged local Ajv schema as the validation authority.',
    '',
    '## Request Count and Cost Boundary',
    '',
    `- Independent probe requests: ${probeRun.requestCount}/${probeRun.maxRequests}.`,
    `- Upstream debug requests: ${debugRun.requestCount}/${debugRun.maxRequests ?? MAX_DEBUG_REQUESTS}.`,
    `- Total OpenRouter requests: ${totalRequests}/12.`,
    '- Retry count: 0.',
    '- Fallback requests initiated by this script: 0. OpenRouter-internal routing attempts, if any, are only represented by sanitized routing metadata.',
    '',
    '## Security',
    '',
    'The artifact excludes credentials, prompt content, full schemas, raw provider responses, raw SSE events, raw upstream bodies, generation/request IDs, account data, billing data, and repository context.',
    ''
  );
  return lines.join('\n');
}

function parseArguments(argv) {
  const options = { independent: false, openRouterDebug: false, output: DEFAULT_REPORT_PATH };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--independent') options.independent = true;
    else if (argument === '--openrouter-debug') options.openRouterDebug = true;
    else if (argument === '--output' && argv[index + 1] && !argv[index + 1].startsWith('-')) {
      options.output = argv[index + 1];
      index += 1;
    } else {
      throw new Error('Usage: node scripts/structured-output-isolation.js [--independent [--openrouter-debug]] [--output <path>]');
    }
  }
  if (options.openRouterDebug && !options.independent) {
    throw new Error('--openrouter-debug requires --independent.');
  }
  return options;
}

async function main() {
  const config = loadIsolationConfiguration();
  const options = parseArguments(process.argv.slice(2));
  let report;
  let requestCount;
  let conclusion;
  if (options.independent) {
    const probeRun = await runIndependentProbes(config, {
      onResult: (result) => process.stdout.write(`${JSON.stringify({ event: 'structured-output.probe', ...result })}\n`)
    });
    const debugRun = options.openRouterDebug
      ? await runOpenRouterUpstreamDebug(config, probeRun, {
        onResult: (result) => process.stdout.write(`${JSON.stringify({ event: 'structured-output.upstream-debug', ...result })}\n`)
      })
      : { results: [], requestCount: 0, maxRequests: MAX_DEBUG_REQUESTS };
    report = serializeIndependentReport({ config, probeRun, debugRun });
    requestCount = probeRun.requestCount + debugRun.requestCount;
    conclusion = buildCausalConclusions(probeRun.results);
  } else {
    const results = await runStructuredOutputIsolation(config, {
      onResult: (result) => process.stdout.write(`${JSON.stringify(result)}\n`)
    });
    report = serializeCompatibilityReport({ config, results });
    requestCount = results.length;
    conclusion = isolationConclusion(results);
  }
  const target = path.resolve(options.output);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, report, 'utf8');
  process.stdout.write(`${JSON.stringify({
    event: 'structured-output-isolation.complete',
    report: options.output,
    requestCount,
    conclusion
  })}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`structured-output-isolation: ${sanitizeDebugText(error.message)}\n`);
    process.exitCode = 1;
  });
}
