import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA,
  AiRuntimeError,
  createOpenAiCompatibleProvider,
  validateOpenAiCompatibleEndpoint
} from '../src/index.js';
import { projectStructuredOutputSchemaForProvider } from '../src/structured-output-schema.js';

const SECRET = 'Bearer test-secret-that-must-not-leak';

function runtimeRequest(overrides = {}) {
  return {
    contractVersion: '1',
    runId: 'run:test',
    contextId: 'sha256:test',
    task: 'version-analysis.v1',
    promptVersion: '1',
    systemPrompt: 'system prompt private marker',
    userPrompt: 'user evidence private marker',
    structuredOutput: {
      mode: 'jsonSchema',
      name: 'upgradelens_version_analysis',
      schema: AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA
    },
    ...overrides
  };
}

function chatResponse(overrides = {}, init = {}) {
  const body = {
    id: 'generation-safe-id',
    model: 'actual-model-revision',
    choices: [
      {
        message: { role: 'assistant', content: '{"summary":"ok"}' },
        finish_reason: 'stop'
      }
    ],
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    ...overrides
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init
  });
}

function provider(fetchImplementation, overrides = {}) {
  return createOpenAiCompatibleProvider({
    endpoint: 'https://provider.example.test/v1/chat/completions?opaque=secret-query',
    model: 'requested-model',
    fetchImplementation,
    ...overrides
  });
}

async function rejectsWithCode(action, code) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof AiRuntimeError);
    assert.equal(error.code, code);
    assert.equal(typeof error.retryable, 'boolean');
    return true;
  });
}

test('configuration rejects missing endpoint, missing model, invalid URL, unsafe schemes, and URL credentials', () => {
  const noCall = async () => { throw new Error('must not call fetch'); };
  assert.throws(() => createOpenAiCompatibleProvider({ model: 'm', fetchImplementation: noCall }), /endpoint is required/);
  assert.throws(() => createOpenAiCompatibleProvider({ endpoint: 'https://example.test', fetchImplementation: noCall }), /model is required/);
  assert.throws(() => createOpenAiCompatibleProvider({ endpoint: 'not a url', model: 'm', fetchImplementation: noCall }), /valid URL/);
  assert.throws(() => createOpenAiCompatibleProvider({ endpoint: 'file:///tmp/model', model: 'm', fetchImplementation: noCall }), /HTTP or HTTPS/);
  assert.throws(() => createOpenAiCompatibleProvider({ endpoint: 'https://user:pass@example.test', model: 'm', fetchImplementation: noCall }), /must not contain credentials/);
});

test('remote plain HTTP is rejected while localhost, IPv4 loopback, and IPv6 loopback HTTP are accepted', () => {
  assert.throws(() => validateOpenAiCompatibleEndpoint('http://example.test/v1/chat/completions'), /must use HTTPS/);
  assert.equal(validateOpenAiCompatibleEndpoint('http://localhost:11434/v1/chat/completions').hostname, 'localhost');
  assert.equal(validateOpenAiCompatibleEndpoint('http://127.0.0.2:8000/v1/chat/completions').protocol, 'http:');
  assert.equal(validateOpenAiCompatibleEndpoint('http://[::1]:1234/v1/chat/completions').protocol, 'http:');
});

test('request mapping sends exact model, rendered messages, strict schema, no streaming, and safe transport controls', async () => {
  const calls = [];
  const schema = structuredClone(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
  const runtime = provider(async (url, init) => {
    calls.push({ url, init });
    return chatResponse();
  }, {
    authorization: SECRET,
    requestExtras: {
      temperature: 0,
      model: 'override-attempt',
      messages: [{ role: 'user', content: 'override-attempt' }],
      response_format: { type: 'json_object' },
      stream: true,
      tools: [{ type: 'function' }],
      models: ['fallback-model'],
      fallbacks: ['fallback-model'],
      plugins: [{ id: 'response-healing' }]
    }
  });

  await runtime.generateStructured(runtimeRequest({
    structuredOutput: {
      mode: 'jsonSchema',
      name: 'upgradelens_version_analysis',
      schema
    }
  }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.headers.authorization, SECRET);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'requested-model');
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'system prompt private marker' },
    { role: 'user', content: 'user evidence private marker' }
  ]);
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 0);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.name, 'upgradelens_version_analysis');
  assert.equal(body.response_format.json_schema.strict, true);
  const providerSchema = body.response_format.json_schema.schema;
  assert.deepEqual(providerSchema, projectStructuredOutputSchemaForProvider(schema));
  assert.notDeepEqual(providerSchema, schema);
  assert.equal(JSON.stringify(providerSchema).includes('uniqueItems'), false);
  assert.equal(JSON.stringify(providerSchema).includes('pattern'), true);
  assert.equal(JSON.stringify(providerSchema).includes('minItems'), true);
  assert.equal(JSON.stringify(providerSchema).includes('items'), true);
  assert.equal(JSON.stringify(providerSchema).includes('required'), true);
  assert.equal(JSON.stringify(providerSchema).includes('additionalProperties'), true);
  assert.deepEqual(schema, AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
  assert.equal('context' in body, false);
  assert.equal('tools' in body, false);
  assert.equal('models' in body, false);
  assert.equal('fallbacks' in body, false);
  assert.equal('plugins' in body, false);
});

test('Authorization is optional and absent configuration does not send the header', async () => {
  let headers;
  const runtime = provider(async (_url, init) => {
    headers = init.headers;
    return chatResponse();
  });
  await runtime.generateStructured(runtimeRequest());
  assert.equal('authorization' in headers, false);
});

test('valid response normalizes output, requested/actual identity, usage, latency, finish reason, and no-retry defaults', async () => {
  const times = [100, 125];
  const runtime = provider(async () => chatResponse(), { clock: { now: () => times.shift() } });
  const result = await runtime.generateStructured(runtimeRequest());

  assert.equal(result.output, '{"summary":"ok"}');
  assert.equal(result.provider, 'openai-compatible');
  assert.equal(result.requestedProvider, 'openai-compatible');
  assert.equal(result.model, 'requested-model');
  assert.equal(result.requestedModel, 'requested-model');
  assert.equal(result.actualModel, 'actual-model-revision');
  assert.equal(result.finishReason, 'complete');
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 4, totalTokens: 14 });
  assert.equal(result.latencyMs, 25);
  assert.equal(result.providerRequestId, 'generation-safe-id');
  assert.deepEqual(
    [result.attemptCount, result.retryCount, result.fallbackCount, result.fallbackOccurred],
    [1, 0, 0, false]
  );
});

test('missing or malformed usage is represented as null rather than zero', async () => {
  const runtime = provider(async () => chatResponse({ usage: { prompt_tokens: '10' } }));
  const result = await runtime.generateStructured(runtimeRequest());
  assert.deepEqual(result.usage, { inputTokens: null, outputTokens: null, totalTokens: null });
});

for (const [name, body, code] of [
  ['missing choices', { choices: undefined }, 'INVALID_RESPONSE'],
  ['empty choices', { choices: [] }, 'INVALID_RESPONSE'],
  ['multiple choices', { choices: [{}, {}] }, 'INVALID_RESPONSE'],
  ['missing message', { choices: [{ finish_reason: 'stop' }] }, 'INVALID_RESPONSE'],
  ['empty content', { choices: [{ message: { role: 'assistant', content: '  ' }, finish_reason: 'stop' }] }, 'INVALID_RESPONSE'],
  ['tool-only response', { choices: [{ message: { role: 'assistant', content: '', tool_calls: [{}] }, finish_reason: 'tool_calls' }] }, 'INVALID_RESPONSE'],
  ['truncated finish reason', { choices: [{ message: { role: 'assistant', content: '{}' }, finish_reason: 'length' }] }, 'OUTPUT_TRUNCATED'],
  ['content filter finish reason', { choices: [{ message: { role: 'assistant', content: '{}' }, finish_reason: 'content_filter' }] }, 'CONTENT_REFUSED'],
  ['explicit refusal', { choices: [{ message: { role: 'assistant', content: '', refusal: 'no' }, finish_reason: 'stop' }] }, 'CONTENT_REFUSED'],
  ['unknown finish reason', { choices: [{ message: { role: 'assistant', content: '{}' }, finish_reason: null }] }, 'INVALID_RESPONSE']
]) {
  test(`response mapping rejects ${name}`, async () => {
    const runtime = provider(async () => chatResponse(body));
    await rejectsWithCode(() => runtime.generateStructured(runtimeRequest()), code);
  });
}

test('invalid JSON response envelope and non-JSON success content type are invalid responses', async () => {
  const invalidJson = provider(async () => new Response('{broken', {
    status: 200,
    headers: { 'content-type': 'application/json' }
  }));
  await rejectsWithCode(() => invalidJson.generateStructured(runtimeRequest()), 'INVALID_RESPONSE');

  const wrongType = provider(async () => new Response('{}', {
    status: 200,
    headers: { 'content-type': 'text/plain' }
  }));
  await rejectsWithCode(() => wrongType.generateStructured(runtimeRequest()), 'INVALID_RESPONSE');
});

test('declared and streamed oversized response bodies fail with RESPONSE_TOO_LARGE', async () => {
  const declared = provider(async () => new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-length': '1000' }
  }), { maxResponseBytes: 16 });
  await rejectsWithCode(() => declared.generateStructured(runtimeRequest()), 'RESPONSE_TOO_LARGE');

  const streamed = provider(async () => chatResponse({ padding: 'x'.repeat(100) }), { maxResponseBytes: 32 });
  await rejectsWithCode(() => streamed.generateStructured(runtimeRequest()), 'RESPONSE_TOO_LARGE');
});

for (const [status, errorBody, code, retryable] of [
  [401, { error: { message: `unauthorized ${SECRET}` } }, 'AUTH_ERROR', false],
  [403, { error: { message: `forbidden ${SECRET}` } }, 'ACCESS_DENIED', false],
  [402, { error: { message: `insufficient credit ${SECRET}` } }, 'INSUFFICIENT_CREDIT', false],
  [404, { error: { code: 'model_not_found', message: 'model does not exist' } }, 'MODEL_NOT_FOUND', false],
  [429, { error: { message: 'rate limit' } }, 'RATE_LIMITED', true],
  [500, { error: { message: 'internal provider failure' } }, 'PROVIDER_ERROR', false],
  [502, { error: { message: 'bad gateway' } }, 'PROVIDER_UNAVAILABLE', true],
  [503, { error: { message: 'unavailable' } }, 'PROVIDER_UNAVAILABLE', true],
  [504, { error: { message: 'gateway timeout' } }, 'TIMEOUT', true]
]) {
  test(`HTTP ${status} maps to ${code} without leaking provider body`, async () => {
    const runtime = provider(async () => new Response(JSON.stringify(errorBody), {
      status,
      headers: { 'content-type': 'application/json' }
    }), { authorization: SECRET });
    await assert.rejects(() => runtime.generateStructured(runtimeRequest()), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.equal(error.retryable, retryable);
      const exposed = `${error.message} ${JSON.stringify(error)}`;
      assert.doesNotMatch(exposed, /test-secret|private marker|secret-query|unauthorized|forbidden/);
      return true;
    });
  });
}

test('schema rejection and unsupported structured output have distinct stable codes without downgrade', async () => {
  const rejected = provider(async () => new Response(JSON.stringify({
    error: { type: 'invalid_request_error', message: 'json_schema is invalid' }
  }), { status: 400, headers: { 'content-type': 'application/json' } }));
  await rejectsWithCode(() => rejected.generateStructured(runtimeRequest()), 'SCHEMA_REJECTED');

  const unsupported = provider(async () => new Response(JSON.stringify({
    error: { type: 'unsupported_parameter', message: 'response_format json_schema is not supported' }
  }), { status: 400, headers: { 'content-type': 'application/json' } }));
  await rejectsWithCode(() => unsupported.generateStructured(runtimeRequest()), 'STRUCTURED_OUTPUT_UNSUPPORTED');

  let calls = 0;
  const wrongMode = provider(async () => { calls += 1; return chatResponse(); });
  await rejectsWithCode(() => wrongMode.generateStructured(runtimeRequest({
    structuredOutput: { mode: 'jsonMode', name: 'x', schema: {} }
  })), 'STRUCTURED_OUTPUT_UNSUPPORTED');
  assert.equal(calls, 0);
});

test('invalid request and 422 validation failures stay distinct from schema rejection', async () => {
  const invalidRequest = provider(async () => new Response(JSON.stringify({
    error: { type: 'invalid_request_error', message: 'temperature must be between zero and one' }
  }), { status: 400, headers: { 'content-type': 'application/json' } }));
  await rejectsWithCode(() => invalidRequest.generateStructured(runtimeRequest()), 'INVALID_REQUEST');

  const schema = provider(async () => new Response(JSON.stringify({
    error: { metadata: { code: 'invalid_json_schema', message: 'response_format schema validation failed' } }
  }), { status: 422, headers: { 'content-type': 'application/json' } }));
  await rejectsWithCode(() => schema.generateStructured(runtimeRequest()), 'SCHEMA_REJECTED');

  const validation = provider(async () => new Response(JSON.stringify({
    error: { type: 'validation_error', message: 'messages is required' }
  }), { status: 422, headers: { 'content-type': 'application/json' } }));
  await rejectsWithCode(() => validation.generateStructured(runtimeRequest()), 'INVALID_REQUEST');
});

test('metadata descriptor fields classify safely while ignored fields, raw body, and long messages are removed', async () => {
  const privateMarker = 'private-account-billing-marker';
  const longMessage = `schema ${'x'.repeat(1_000)} ${privateMarker}`;
  const runtime = provider(async () => new Response(JSON.stringify({
    account: privateMarker,
    error: {
      metadata: {
        error_type: 'unsupported_parameter',
        code: 'response_format_not_supported',
        message: longMessage,
        billing_detail: privateMarker
      }
    }
  }), { status: 400, headers: { 'content-type': 'application/json' } }), { authorization: SECRET });

  await assert.rejects(() => runtime.generateStructured(runtimeRequest()), (error) => {
    assert.equal(error.code, 'STRUCTURED_OUTPUT_UNSUPPORTED');
    assert.equal(error.status, 400);
    const exposed = `${error.message} ${JSON.stringify(error)}`;
    assert.doesNotMatch(exposed, /private-account|billing-marker|test-secret|x{100}/);
    assert.ok(exposed.length < 512);
    return true;
  });
});

test('network failure and bounded deadline map to typed retryable errors without automatic retry', async () => {
  let networkCalls = 0;
  const network = provider(async () => {
    networkCalls += 1;
    throw new TypeError('connect failed with private marker');
  });
  await assert.rejects(() => network.generateStructured(runtimeRequest()), (error) => {
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(error.retryable, true);
    assert.doesNotMatch(error.message, /private marker/);
    return true;
  });
  assert.equal(networkCalls, 1);

  let timeoutCalls = 0;
  const timeout = provider(async (_url, init) => {
    timeoutCalls += 1;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
  }, { timeoutMs: 5 });
  await rejectsWithCode(() => timeout.generateStructured(runtimeRequest()), 'TIMEOUT');
  assert.equal(timeoutCalls, 1);
});

test('caller cancellation maps to CANCELLED and discards partial execution', async () => {
  const controller = new AbortController();
  const runtime = provider(async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  }));
  const pending = runtime.generateStructured(runtimeRequest({ signal: controller.signal }));
  controller.abort();
  await rejectsWithCode(() => pending, 'CANCELLED');
});

test('locked exact identity can reject a different actual model', async () => {
  const runtime = provider(async () => chatResponse(), { requireExactModelIdentity: true });
  await rejectsWithCode(() => runtime.generateStructured(runtimeRequest()), 'IDENTITY_MISMATCH');
});
