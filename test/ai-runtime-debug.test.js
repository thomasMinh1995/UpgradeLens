import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA,
  AiRuntimeError,
  buildSchemaDiagnostics,
  createOpenAiCompatibleProvider,
  isAiRuntimeDebugEnabled,
  sanitizeDebugText
} from '../src/index.js';
import { projectStructuredOutputSchemaForProvider } from '../src/structured-output-schema.js';

const AUTHORIZATION = 'Bearer sk-or-v1-test-secret-material';
const SYSTEM_PROMPT = 'system prompt private marker';
const USER_PROMPT = 'Dependency AI Context evidence private marker';

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function request() {
  return {
    contractVersion: '1',
    runId: 'run:debug',
    contextId: 'sha256:debug',
    task: 'version-analysis.v1',
    promptVersion: '1',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT,
    structuredOutput: {
      mode: 'jsonSchema',
      name: 'upgradelens_version_analysis',
      schema: AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA
    }
  };
}

function successResponse(content = '{"summary":"assistant private content"}') {
  return new Response(JSON.stringify({
    id: 'gen-debug-safe',
    model: 'openai/gpt-test-2026',
    choices: [{
      message: { role: 'assistant', content },
      finish_reason: 'stop'
    }],
    usage: { prompt_tokens: 101, completion_tokens: 23, total_tokens: 124 }
  }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function debugCapture() {
  const lines = [];
  return {
    writer: { write(line) { lines.push(line); } },
    records() { return lines.map((line) => JSON.parse(line)); },
    text() { return lines.join(''); }
  };
}

test('debug env parsing is strict and defaults to disabled', () => {
  assert.equal(isAiRuntimeDebugEnabled({}), false);
  assert.equal(isAiRuntimeDebugEnabled({ UPGRADELENS_AI_DEBUG: '0' }), false);
  assert.equal(isAiRuntimeDebugEnabled({ UPGRADELENS_AI_DEBUG: 'false' }), false);
  assert.equal(isAiRuntimeDebugEnabled({ UPGRADELENS_AI_DEBUG: 'FALSE' }), false);
  assert.equal(isAiRuntimeDebugEnabled({ UPGRADELENS_AI_DEBUG: '1' }), true);
  assert.equal(isAiRuntimeDebugEnabled({ UPGRADELENS_AI_DEBUG: 'true' }), true);
  assert.equal(isAiRuntimeDebugEnabled({ UPGRADELENS_AI_DEBUG: 'TRUE' }), true);
  assert.throws(
    () => isAiRuntimeDebugEnabled({ UPGRADELENS_AI_DEBUG: 'yes' }),
    /must be one of: 1, true, 0, false/
  );
});

test('debug text normalization removes controls and redacts bounded credential and account patterns', () => {
  const sanitized = sanitizeDebugText([
    'line\u0000break',
    'Bearer token-value',
    'sk-or-v1-secret',
    'sk-another-secret',
    'api_key=private-value',
    'Authorization: credential-value',
    'https://user:password@example.test/path',
    'owner@example.test',
    'account_id=acct-private',
    'billing_detail=bill-private',
    'x'.repeat(1_000)
  ].join(' '));

  assert.ok(sanitized.length <= 500);
  assert.doesNotMatch(sanitized, /\u0000|Bearer |token-value|sk-or-|sk-another|private-value|credential-value/);
  assert.doesNotMatch(sanitized, /user:password|owner@example|acct-private|bill-private/);
  assert.match(sanitized, /\[REDACTED/);
});

test('schema diagnostics are deterministic, bounded, circular-safe, and count required keywords', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          oneOf: [
            { const: 'x', pattern: '^x$' },
            { enum: ['y'] }
          ]
        },
        minItems: 1,
        uniqueItems: true
      },
      linked: { $ref: '#/$defs/value' }
    },
    $defs: {
      value: {
        anyOf: [
          { type: 'string', format: 'uri' },
          { allOf: [{ type: 'number' }] }
        ]
      }
    }
  };
  const reordered = {
    $defs: schema.$defs,
    properties: schema.properties,
    required: schema.required,
    additionalProperties: schema.additionalProperties,
    type: schema.type,
    $schema: schema.$schema
  };
  const first = buildSchemaDiagnostics(schema);
  const second = buildSchemaDiagnostics(reordered);

  assert.equal(first.schemaDigest, second.schemaDigest);
  assert.equal(first.propertyCount, 2);
  assert.equal(first.requiredCount, 1);
  assert.deepEqual(first.topLevelKeys, ['$defs', '$schema', 'additionalProperties', 'properties', 'required', 'type']);
  assert.deepEqual({
    $schema: first.keywordCounts.$schema,
    type: first.keywordCounts.type,
    properties: first.keywordCounts.properties,
    required: first.keywordCounts.required,
    additionalProperties: first.keywordCounts.additionalProperties,
    enum: first.keywordCounts.enum,
    const: first.keywordCounts.const,
    pattern: first.keywordCounts.pattern,
    format: first.keywordCounts.format,
    items: first.keywordCounts.items,
    minItems: first.keywordCounts.minItems,
    uniqueItems: first.keywordCounts.uniqueItems,
    anyOf: first.keywordCounts.anyOf,
    oneOf: first.keywordCounts.oneOf,
    allOf: first.keywordCounts.allOf,
    $ref: first.keywordCounts.$ref,
    $defs: first.keywordCounts.$defs
  }, {
    $schema: 1,
    type: 4,
    properties: 1,
    required: 1,
    additionalProperties: 1,
    enum: 1,
    const: 1,
    pattern: 1,
    format: 1,
    items: 1,
    minItems: 1,
    uniqueItems: 1,
    anyOf: 1,
    oneOf: 1,
    allOf: 1,
    $ref: 1,
    $defs: 1
  });

  const circular = { type: 'object' };
  circular.self = circular;
  assert.doesNotThrow(() => buildSchemaDiagnostics(circular));

  const oversizedEnum = { enum: Array.from({ length: 20_000 }, (_, index) => index) };
  assert.equal(buildSchemaDiagnostics(oversizedEnum).traversalTruncated, true);
});

test('debug disabled emits nothing and debug enabled records sanitized exact request metadata', async () => {
  let requestBody;
  const disabled = debugCapture();
  const disabledProvider = createOpenAiCompatibleProvider({
    endpoint: 'https://openrouter.ai/api/v1/chat/completions?secret=query',
    model: 'openai/gpt-test',
    authorization: AUTHORIZATION,
    debug: false,
    debugWriter: disabled.writer,
    fetchImplementation: async (_url, init) => {
      requestBody = init.body;
      return successResponse();
    }
  });
  const disabledResult = await disabledProvider.generateStructured(request());
  assert.equal(disabled.text(), '');

  const enabled = debugCapture();
  let calls = 0;
  const enabledProvider = createOpenAiCompatibleProvider({
    endpoint: 'https://openrouter.ai/api/v1/chat/completions?secret=query',
    model: 'openai/gpt-test',
    authorization: AUTHORIZATION,
    debug: true,
    debugWriter: enabled.writer,
    requestExtras: { temperature: 0, tools: ['ignored'] },
    fetchImplementation: async (_url, init) => {
      calls += 1;
      requestBody = init.body;
      return successResponse();
    }
  });
  const enabledResult = await enabledProvider.generateStructured(request());
  const [requestRecord, responseRecord] = enabled.records();
  const debugText = enabled.text();

  assert.equal(calls, 1);
  assert.equal(enabledResult.output, disabledResult.output);
  assert.equal(requestRecord.event, 'ai.runtime.request');
  assert.deepEqual(requestRecord.endpoint, {
    protocol: 'https:',
    hostname: 'openrouter.ai',
    pathname: '/api/v1/chat/completions'
  });
  assert.equal(Object.hasOwn(requestRecord, 'authorizationConfigured'), false);
  assert.equal(requestRecord.messageCount, 2);
  assert.deepEqual(requestRecord.messages, [
    { role: 'system', characterCount: SYSTEM_PROMPT.length, sha256: digest(SYSTEM_PROMPT) },
    { role: 'user', characterCount: USER_PROMPT.length, sha256: digest(USER_PROMPT) }
  ]);
  assert.equal(requestRecord.requestBodyBytes, Buffer.byteLength(requestBody, 'utf8'));
  assert.deepEqual(requestRecord.requestExtraKeys, ['temperature']);
  const exactDiagnostics = buildSchemaDiagnostics(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
  const projectedSchema = projectStructuredOutputSchemaForProvider(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
  const projectedDiagnostics = buildSchemaDiagnostics(projectedSchema);
  const sentSchema = JSON.parse(requestBody).response_format.json_schema.schema;
  assert.deepEqual(sentSchema, projectedSchema);
  assert.equal(requestRecord.structuredOutput.schemaDigest, projectedDiagnostics.schemaDigest);
  assert.equal(requestRecord.structuredOutput.schemaBytes, projectedDiagnostics.schemaBytes);
  assert.notEqual(requestRecord.structuredOutput.schemaDigest, exactDiagnostics.schemaDigest);
  assert.equal(requestRecord.schemaDiagnostics.propertyCount, 5);
  assert.equal(requestRecord.schemaDiagnostics.requiredCount, 5);
  assert.equal(requestRecord.schemaDiagnostics.keywordCounts.uniqueItems, 0);
  assert.equal(requestRecord.schemaDiagnostics.keywordCounts.pattern, 3);
  assert.equal(requestRecord.schemaDiagnostics.keywordCounts.minItems, 1);
  assert.equal(responseRecord.event, 'ai.runtime.response');
  assert.equal(Object.hasOwn(responseRecord, 'providerRequestId'), false);
  assert.equal(responseRecord.assistantContentChars, enabledResult.output.length);
  assert.equal(responseRecord.assistantContentDigest, digest(enabledResult.output));
  assert.deepEqual(responseRecord.usage, { inputTokens: 101, outputTokens: 23, totalTokens: 124 });
  assert.doesNotMatch(debugText, /secret=query|sk-or-|Bearer |test-secret|system prompt|evidence private|assistant private content/);
  assert.doesNotMatch(debugText, /summaryEvidenceRefs|riskEvidenceRefs|findings/);
});

test('non-2xx debug record keeps only redacted allowlisted scalars and preserves runtime behavior', async () => {
  const capture = debugCapture();
  const privateMarker = 'private-nested-marker';
  const longTail = 'z'.repeat(800);
  let calls = 0;
  const runtime = createOpenAiCompatibleProvider({
    endpoint: 'https://provider.example.test/v1/chat/completions',
    model: 'openai/gpt-test',
    authorization: AUTHORIZATION,
    debug: true,
    debugWriter: capture.writer,
    fetchImplementation: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        account: privateMarker,
        error: {
          code: 'invalid_request',
          type: 'invalid_request_error',
          message: `bad request\u0000 Bearer token-secret sk-or-v1-provider-secret ${longTail}`,
          metadata: {
            error_type: 'provider_validation',
            code: 'bad_parameters',
            message: 'authorization=private-value owner@example.test',
            raw: privateMarker,
            billing_detail: privateMarker
          }
        }
      }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
  });

  await assert.rejects(() => runtime.generateStructured(request()), (error) => {
    assert.ok(error instanceof AiRuntimeError);
    assert.equal(error.code, 'INVALID_REQUEST');
    assert.equal(error.status, 400);
    return true;
  });
  const records = capture.records();
  const errorRecord = records[1];
  const debugText = capture.text();

  assert.equal(calls, 1);
  assert.equal(records.length, 2);
  assert.equal(errorRecord.event, 'ai.runtime.error');
  assert.equal(errorRecord.runtimeCode, 'INVALID_REQUEST');
  assert.equal(errorRecord.retryable, false);
  assert.deepEqual(Object.keys(errorRecord.providerError).sort(), [
    'code', 'message', 'metadataCode', 'metadataErrorType', 'metadataMessage', 'type'
  ]);
  assert.ok(errorRecord.providerError.message.length <= 500);
  assert.doesNotMatch(debugText, /private-nested|billing_detail|"raw"|Bearer |token-secret|sk-or-|provider-secret/);
  assert.doesNotMatch(debugText, /private-value|owner@example|system prompt|evidence private/);
});

test('debug writer validation fails before fetch', async () => {
  let calls = 0;
  assert.throws(() => createOpenAiCompatibleProvider({
    endpoint: 'https://provider.example.test/v1/chat/completions',
    model: 'openai/gpt-test',
    debug: true,
    debugWriter: {},
    fetchImplementation: async () => { calls += 1; return successResponse(); }
  }), /debug writer/);
  assert.equal(calls, 0);
});
