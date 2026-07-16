import assert from 'node:assert/strict';
import test from 'node:test';

import { AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA } from '../src/ai-version-analysis.js';
import { buildSchemaDiagnostics } from '../src/ai-runtime-debug.js';
import {
  buildCausalConclusions,
  buildIndependentProbes,
  buildIsolationCases,
  isolationConclusion,
  loadIsolationConfiguration,
  parseCanonicalProbeError,
  parseOpenRouterDebugSse,
  removeSchemaKeywords,
  runIndependentProbes,
  runOpenRouterUpstreamDebug,
  runStructuredOutputIsolation,
  serializeCompatibilityReport,
  serializeIndependentReport,
  summarizeRequestStructure
} from '../scripts/structured-output-isolation.js';

const AUTHORIZATION = 'Bearer sk-or-v1-test-isolation-secret';
const ENV = {
  UPGRADELENS_AI_PROVIDER: 'openai-compatible',
  UPGRADELENS_AI_ENDPOINT: 'https://openrouter.ai/api/v1/chat/completions',
  UPGRADELENS_AI_MODEL: 'openai/test-model',
  UPGRADELENS_AI_AUTHORIZATION: AUTHORIZATION,
  UPGRADELENS_AI_TIMEOUT_MS: '180000'
};

test('configuration is environment-only, strict, and preserves the current runtime variables', () => {
  const config = loadIsolationConfiguration(ENV);
  assert.equal(config.provider, 'openai-compatible');
  assert.equal(config.endpoint.href, ENV.UPGRADELENS_AI_ENDPOINT);
  assert.equal(config.model, ENV.UPGRADELENS_AI_MODEL);
  assert.equal(config.authorization, AUTHORIZATION);
  assert.equal(config.timeoutMs, 180000);

  assert.throws(() => loadIsolationConfiguration({}), /UPGRADELENS_AI_PROVIDER is required/);
  assert.throws(
    () => loadIsolationConfiguration({ ...ENV, UPGRADELENS_AI_PROVIDER: 'openrouter' }),
    /must be openai-compatible/
  );
  assert.throws(
    () => loadIsolationConfiguration({ ...ENV, UPGRADELENS_AI_TIMEOUT_MS: '0' }),
    /positive integer/
  );
});

test('the ten ordered cases isolate additions and finish with the exact production schema', () => {
  const cases = buildIsolationCases();
  assert.equal(cases.length, 10);
  assert.deepEqual(cases.map(({ id }) => id), Array.from({ length: 10 }, (_, index) => `case-${index + 1}`));
  assert.equal(cases[0].schema, null);
  assert.deepEqual(cases[1].schema, {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
    additionalProperties: false
  });
  assert.deepEqual(cases[9].schema, AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
  assert.notEqual(cases[9].schema, AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);

  assert.deepEqual(cases[2].schema.properties.level.enum, ['low', 'high']);
  assert.equal(cases[3].schema.properties.tags.type, 'array');
  assert.equal(Object.hasOwn(cases[3].schema.properties.tags, 'items'), false);
  assert.equal(cases[4].schema.properties.tags.uniqueItems, true);
  assert.equal(cases[5].schema.properties.code.pattern, '^[A-Z]{2}$');
  assert.equal(cases[6].schema.properties.nested.type, 'object');
  assert.deepEqual(cases[7].schema.properties.tags.items, { type: 'string' });

  const exactKeywords = buildSchemaDiagnostics(cases[9].schema).keywordCounts;
  const syntheticKeywords = buildSchemaDiagnostics(cases[8].schema).keywordCounts;
  for (const [keyword, count] of Object.entries(exactKeywords)) {
    if (count > 0) assert.ok(syntheticKeywords[keyword] > 0, `case-9 must include ${keyword}`);
  }
});

test('runner sends one minimal request per case with no retry, fallback, or raw response logging', async () => {
  const calls = [];
  const fetchImplementation = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    const caseNumber = body.response_format
      ? Number(body.response_format.json_schema.name.match(/(?:case_)(\d+)$/)?.[1] ?? 10)
      : 1;
    if (caseNumber < 6) {
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      error: {
        code: 400,
        message: 'Provider returned error | You are a JSON generator. | Bearer sk-or-v1-provider-secret',
        unapprovedRawBody: 'must never be exposed',
        metadata: { private: 'must never be exposed' }
      },
      raw: 'must never be exposed'
    }), { status: 400, headers: { 'content-type': 'application/json' } });
  };

  const config = loadIsolationConfiguration(ENV);
  const observed = [];
  const results = await runStructuredOutputIsolation(config, {
    fetchImplementation,
    onResult: (result) => observed.push(result)
  });

  assert.equal(calls.length, 10);
  assert.equal(results.length, 10);
  assert.deepEqual(observed, results);
  assert.ok(results.slice(0, 5).every(({ pass }) => pass));
  assert.ok(results.slice(5).every(({ pass }) => !pass));
  assert.ok(results.every((result) => result.attemptCount === 1));
  assert.ok(results.every((result) => result.retryCount === 0));
  assert.ok(results.every((result) => result.fallbackCount === 0));

  for (const call of calls) {
    assert.equal(call.url.href, ENV.UPGRADELENS_AI_ENDPOINT);
    assert.equal(call.init.headers.authorization, AUTHORIZATION);
    assert.equal(call.init.redirect, 'error');
    assert.equal(call.body.model, ENV.UPGRADELENS_AI_MODEL);
    assert.deepEqual(call.body.messages, [
      { role: 'system', content: 'You are a JSON generator. Return only JSON matching the supplied schema.' },
      { role: 'user', content: 'Return one valid object.' }
    ]);
    assert.equal(call.body.stream, false);
    assert.deepEqual(Object.keys(call.body).sort(), call.body.response_format
      ? ['messages', 'model', 'response_format', 'stream']
      : ['messages', 'model', 'stream']);
  }
  assert.equal(Object.hasOwn(calls[0].body, 'response_format'), false);
  assert.equal(calls[1].body.response_format.type, 'json_schema');
  assert.equal(calls[1].body.response_format.json_schema.strict, true);
  assert.deepEqual(calls[9].body.response_format.json_schema.schema, AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);

  assert.deepEqual(Object.keys(results[5].providerError).sort(), ['code', 'message']);
  const safeOutput = JSON.stringify(results);
  assert.doesNotMatch(safeOutput, /sk-or-|Bearer |must never be exposed|You are a JSON generator|Return one valid object/);
  assert.match(safeOutput, /\[REDACTED/);

  const report = serializeCompatibilityReport({ config, results, generatedAt: '2026-07-15T00:00:00.000Z' });
  assert.match(report, /Total OpenRouter requests: 10/);
  assert.match(report, /case-1.*PASS/);
  assert.match(report, /case-6.*FAIL/);
  assert.doesNotMatch(report, /sk-or-|Bearer |must never be exposed|You are a JSON generator|Return one valid object/);
});

test('conclusion distinguishes baseline, native mode, exact schema, monotonic, and ambiguous failures', () => {
  const passing = (index) => ({
    case: `case-${index + 1}`,
    label: `Case ${index + 1}`,
    introduced: `feature-${index + 1}`,
    pass: true
  });
  const allPass = Array.from({ length: 10 }, (_, index) => passing(index));
  assert.match(isolationConclusion(allPass), /All isolation schemas passed/);

  const baselineFail = structuredClone(allPass);
  baselineFail[0].pass = false;
  assert.match(isolationConclusion(baselineFail), /baseline failed/);

  const nativeFail = structuredClone(allPass);
  for (let index = 1; index < nativeFail.length; index += 1) nativeFail[index].pass = false;
  assert.match(isolationConclusion(nativeFail), /native json_schema/);

  const exactFail = structuredClone(allPass);
  exactFail[9].pass = false;
  assert.match(isolationConclusion(exactFail), /only the exact UpgradeLens schema failed/);

  const arrayBoundary = structuredClone(allPass);
  for (let index = 3; index < arrayBoundary.length; index += 1) arrayBoundary[index].pass = false;
  assert.match(isolationConclusion(arrayBoundary), /cannot distinguish rejection of the array keyword from a requirement that every array declare items/);

  const monotonic = structuredClone(allPass);
  for (let index = 5; index < monotonic.length; index += 1) monotonic[index].pass = false;
  assert.match(isolationConclusion(monotonic), /feature-6 is the leading compatibility boundary/);

  const nonMonotonic = structuredClone(allPass);
  nonMonotonic[4].pass = false;
  nonMonotonic[7].pass = false;
  assert.match(isolationConclusion(nonMonotonic), /non-monotonic/);
});

test('independent matrix isolates each feature, removes keywords recursively, and never mutates the source schema', () => {
  const sourceBefore = structuredClone(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
  const probes = buildIndependentProbes();
  const byId = new Map(probes.map((probe) => [probe.id, probe]));
  assert.equal(probes.length, 11);
  assert.deepEqual(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA, sourceBefore);

  assert.deepEqual(byId.get('baseline').schema, {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
    additionalProperties: false
  });
  assert.deepEqual(byId.get('probe-a').schema.properties.values, {
    type: 'array',
    items: { type: 'string' }
  });
  assert.deepEqual(byId.get('probe-b').schema.properties.values, {
    type: 'array',
    items: { type: 'string' },
    uniqueItems: true
  });
  assert.equal(Object.hasOwn(byId.get('probe-b').schema.properties.values, 'minItems'), false);
  assert.deepEqual(Object.keys(byId.get('probe-c').schema.properties), ['value']);
  assert.equal(Object.hasOwn(byId.get('probe-c').schema.properties.value, 'pattern'), true);
  assert.deepEqual(Object.keys(byId.get('probe-d').schema.properties), ['nested']);
  assert.equal(Object.hasOwn(byId.get('probe-f').schema.properties.values, 'uniqueItems'), false);
  assert.equal(byId.get('probe-f').schema.properties.values.minItems, 1);

  const removed = removeSchemaKeywords(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA, ['uniqueItems', 'pattern']);
  assert.deepEqual(removed, byId.get('probe-i').schema);
  assert.deepEqual(removeSchemaKeywords(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA, ['pattern', 'uniqueItems']), removed);
  assert.deepEqual(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA, sourceBefore);
  assert.equal(buildSchemaDiagnostics(byId.get('probe-i').schema).keywordCounts.uniqueItems, 0);
  assert.equal(buildSchemaDiagnostics(byId.get('probe-i').schema).keywordCounts.pattern, 0);
  assert.equal(
    buildSchemaDiagnostics(byId.get('probe-i').schema).schemaDigest,
    buildSchemaDiagnostics(byId.get('probe-j').schema).schemaDigest
  );
});

function probeName(body) {
  return body.response_format.json_schema.name
    .replace('upgradelens_isolation_', '')
    .replaceAll('_', '-');
}

function probeResponse(pass, {
  errorType = 'invalid_request',
  providerCode = 'unsupported_keyword',
  routing = true
} = {}) {
  if (pass) {
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
      ...(routing ? { openrouter_metadata: { requested: 'openai/test-model', strategy: 'direct', attempt: 1 } } : {})
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({
    error: {
      code: 400,
      message: 'Provider returned error',
      metadata: {
        error_type: errorType,
        provider_code: providerCode,
        raw_provider_error: 'private raw body',
        account_id: 'private account'
      }
    },
    ...(routing ? {
      openrouter_metadata: {
        requested: 'openai/test-model',
        strategy: 'direct',
        attempt: 1,
        endpoints: {
          total: 2,
          available: [
            { provider: 'OpenAI', selected: true, private_url: 'private endpoint' },
            { provider: 'Other', selected: false }
          ]
        },
        pipeline: [{ type: 'provider', name: 'selection', summary: 'selected upstream', private: 'secret' }],
        billing: 'private billing'
      }
    } : {})
  }), { status: 400, headers: { 'content-type': 'application/json' } });
}

test('adaptive probes isolate failures, enforce ten requests, parse canonical errors, and skip duplicate projection digest', async () => {
  const calls = [];
  const outcomes = new Map([
    ['baseline', true],
    ['probe-a', true],
    ['probe-b', false],
    ['probe-f', true],
    ['probe-c', false],
    ['probe-d', true],
    ['probe-e', true],
    ['probe-g', false],
    ['probe-h', false],
    ['probe-i', true]
  ]);
  const config = loadIsolationConfiguration(ENV);
  const sourceBefore = structuredClone(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
  const run = await runIndependentProbes(config, {
    fetchImplementation: async (_url, init) => {
      const body = JSON.parse(init.body);
      const id = probeName(body);
      calls.push({ id, body, init });
      return probeResponse(outcomes.get(id));
    }
  });

  assert.equal(run.requestCount, 10);
  assert.equal(calls.length, 10);
  assert.equal(run.earlyStop, true);
  assert.equal(new Set(calls.map(({ body }) => buildSchemaDiagnostics(body.response_format.json_schema.schema).schemaDigest)).size, 10);
  assert.ok(calls.every(({ init }) => init.headers['x-openrouter-metadata'] === 'enabled'));
  assert.ok(calls.every(({ body }) => body.stream === false));
  assert.ok(calls.every(({ body }) => body.messages.length === 2));
  assert.deepEqual(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA, sourceBefore);

  const byId = new Map(run.results.map((result) => [result.case, result]));
  assert.equal(byId.get('probe-j').runtimeCode, 'SKIPPED_DUPLICATE');
  assert.equal(byId.get('probe-j').duplicateOf, 'probe-i');
  assert.equal(byId.get('probe-b').errorType, 'invalid_request');
  assert.equal(byId.get('probe-b').providerCode, 'unsupported_keyword');
  assert.deepEqual(Object.keys(byId.get('probe-b').providerError).sort(), ['code', 'errorType', 'message', 'providerCode']);
  assert.deepEqual(byId.get('probe-b').routingMetadata, {
    requestedModel: 'openai/test-model',
    strategy: 'direct',
    attempt: 1,
    selectedProviders: ['OpenAI'],
    endpointCount: 2,
    availableEndpointCount: 2,
    pipeline: [{ type: 'provider', name: 'selection', summary: 'selected upstream' }]
  });
  assert.doesNotMatch(JSON.stringify(run), /private raw|private account|private endpoint|private billing/);

  const conclusions = buildCausalConclusions(run.results);
  assert.match(conclusions.uniqueItems, /^CONFIRMED/);
  assert.match(conclusions.pattern, /^CONFIRMED/);
  assert.match(conclusions.exactSchema, /^LIKELY/);
});

test('adaptive early stop avoids unnecessary exact variants and prerequisite failures skip dependent probes', async () => {
  const passExcept = async (_url, init) => {
    const id = probeName(JSON.parse(init.body));
    return probeResponse(!['probe-b'].includes(id));
  };
  const early = await runIndependentProbes(loadIsolationConfiguration(ENV), { fetchImplementation: passExcept });
  assert.equal(early.requestCount, 8);
  assert.equal(early.earlyStop, true);
  const earlyById = new Map(early.results.map((result) => [result.case, result]));
  assert.equal(earlyById.get('probe-g').pass, true);
  assert.equal(earlyById.get('probe-h').runtimeCode, 'SKIPPED_POLICY');
  assert.equal(earlyById.get('probe-i').runtimeCode, 'SKIPPED_POLICY');
  assert.equal(earlyById.get('probe-j').runtimeCode, 'SKIPPED_DUPLICATE');

  let calls = 0;
  const prerequisite = await runIndependentProbes(loadIsolationConfiguration(ENV), {
    fetchImplementation: async (_url, init) => {
      calls += 1;
      const id = probeName(JSON.parse(init.body));
      return probeResponse(id !== 'probe-a');
    }
  });
  const prerequisiteById = new Map(prerequisite.results.map((result) => [result.case, result]));
  assert.equal(prerequisiteById.get('probe-b').runtimeCode, 'SKIPPED_POLICY');
  assert.equal(prerequisiteById.get('probe-f').runtimeCode, 'SKIPPED_POLICY');
  assert.equal(prerequisiteById.get('probe-e').runtimeCode, 'SKIPPED_POLICY');
  assert.equal(calls, prerequisite.requestCount);
  assert.ok(calls <= 10);
});

test('canonical error parsing prioritizes allowlisted error_type and provider_code only', () => {
  assert.deepEqual(parseCanonicalProbeError(JSON.stringify({
    error: {
      code: 422,
      message: 'unprocessable',
      metadata: {
        error_type: 'unprocessable',
        provider_code: 'schema_invalid',
        provider_credentials: 'secret',
        raw: 'secret'
      },
      stack: 'secret'
    },
    account: 'secret'
  })), {
    code: '422',
    message: 'unprocessable',
    errorType: 'unprocessable',
    providerCode: 'schema_invalid'
  });
  assert.equal(parseCanonicalProbeError({ error: { metadata: { error_type: 'new_future_type' } } }).errorType, 'unmapped');
  assert.deepEqual(parseCanonicalProbeError('not json'), {});
});

function sseStream(lines, { onCancel } = {}) {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= lines.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(lines[index]));
      index += 1;
    },
    cancel() {
      onCancel?.();
    }
  });
}

test('SSE debug parser handles first debug event, malformed lines, errors, DONE, and structural redaction', async () => {
  let cancelled = false;
  const upstream = {
    model: 'gpt-test-upstream',
    messages: [
      { role: 'system', content: 'You are a JSON generator. Return only JSON matching the supplied schema.' },
      { role: 'user', content: 'Return one valid object.' }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'safe_name',
        strict: true,
        schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }
      }
    },
    stream: true,
    internal_api_key: 'sk-or-v1-upstream-secret'
  };
  const parsed = await parseOpenRouterDebugSse(sseStream([
    `data: ${JSON.stringify({ debug: { echo_upstream_body: upstream }, choices: [] })}\n`,
    'data: {malformed json}\n',
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'private generated text' }, finish_reason: 'stop' }] })}\n`,
    `data: ${JSON.stringify({ openrouter_metadata: { requested: 'openai/test-model', strategy: 'direct', attempt: 1 } })}\n`,
    'data: [DONE]\n',
    'data: {"raw":"must not be processed"}\n'
  ], { onCancel: () => { cancelled = true; } }));

  assert.equal(parsed.doneObserved, true);
  assert.equal(parsed.malformedLineCount, 1);
  assert.equal(cancelled, true);
  assert.deepEqual(parsed.finishReasons, ['stop']);
  assert.equal(parsed.upstreamSummary.model, 'gpt-test-upstream');
  assert.equal(parsed.upstreamSummary.messageCount, 2);
  assert.deepEqual(parsed.upstreamSummary.messageRoles, ['system', 'user']);
  assert.equal(parsed.upstreamSummary.schemaKeywordCounts.type, 2);
  assert.ok(!parsed.upstreamSummary.transformedTopLevelKeys.includes('internal_api_key'));
  const serialized = JSON.stringify(parsed);
  assert.doesNotMatch(serialized, /You are a JSON generator|Return one valid object|private generated|sk-or-|upstream-secret|internal_api_key|"properties":\{/);

  const errorParsed = await parseOpenRouterDebugSse(sseStream([
    `data: ${JSON.stringify({ error: { code: 429, message: 'limited', metadata: { error_type: 'rate_limit_exceeded', provider_code: 'rate_limited', private: 'secret' } }, choices: [{ finish_reason: 'error' }] })}\n`,
    'data: [DONE]\n'
  ]));
  assert.equal(errorParsed.providerError.errorType, 'rate_limit_exceeded');
  assert.equal(errorParsed.providerError.providerCode, 'rate_limited');
  assert.deepEqual(errorParsed.finishReasons, ['error']);
  assert.doesNotMatch(JSON.stringify(errorParsed), /private|secret/);
});

test('SSE parser enforces its bounded size and cancels the stream safely', async () => {
  let cancelled = false;
  await assert.rejects(
    parseOpenRouterDebugSse(sseStream(['data: ' + 'x'.repeat(200)], { onCancel: () => { cancelled = true; } }), { maxBytes: 32 }),
    (error) => error.code === 'RESPONSE_TOO_LARGE'
  );
  assert.equal(cancelled, true);
});

test('upstream debug sends at most one passing and one failing schema and retains structural metadata only', async () => {
  const probes = buildIndependentProbes();
  const probeRun = {
    results: [
      { case: 'baseline', executed: true, pass: true },
      { case: 'probe-i', executed: true, pass: false }
    ]
  };
  const calls = [];
  const run = await runOpenRouterUpstreamDebug(loadIsolationConfiguration(ENV), probeRun, {
    probes,
    fetchImplementation: async (_url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ body, init });
      if (body.response_format.json_schema.name.endsWith('baseline')) {
        const transformed = {
          model: 'gpt-upstream',
          input: structuredClone(body.messages),
          text: {
            format: {
              type: body.response_format.type,
              ...structuredClone(body.response_format.json_schema)
            }
          },
          stream: true
        };
        return new Response(sseStream([
          `data: ${JSON.stringify({ debug: { echo_upstream_body: transformed }, choices: [] })}\n`,
          'data: [DONE]\n'
        ]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      return probeResponse(false);
    }
  });

  assert.equal(run.requestCount, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ body }) => body.stream === true));
  assert.ok(calls.every(({ body }) => body.debug.echo_upstream_body === true));
  assert.ok(calls.every(({ init }) => init.headers['x-openrouter-metadata'] === 'enabled'));
  assert.equal(run.results[0].debugEchoObserved, true);
  assert.equal(run.results[0].comparison.modelChanged, true);
  assert.equal(run.results[0].comparison.responseFormatPreserved, true);
  assert.equal(run.results[0].comparison.schemaDigestChanged, false);
  assert.equal(run.results[0].comparison.messageCountPreserved, true);
  assert.deepEqual(run.results[0].comparison.addedTopLevelKeys, ['input', 'text']);
  assert.deepEqual(run.results[0].comparison.removedTopLevelKeys, ['debug', 'messages', 'response_format']);
  assert.equal(run.results[1].debugEchoObserved, false);
  assert.equal(run.results[1].errorType, 'invalid_request');
  assert.equal(run.results[1].originAssessment, 'LIKELY_UPSTREAM_REJECTION');
  const serialized = JSON.stringify(run);
  assert.doesNotMatch(serialized, /You are a JSON generator|Return one valid object|"properties":\{|sk-or-|Bearer /);
});

test('upstream debug falls back to one exact-schema failure when adaptive probes stop on a passing remediation', async () => {
  let calls = 0;
  const run = await runOpenRouterUpstreamDebug(loadIsolationConfiguration(ENV), {
    results: [
      { case: 'baseline', executed: true, pass: true },
      { case: 'probe-g', executed: true, pass: true }
    ]
  }, {
    includeBaseline: false,
    fetchImplementation: async (_url, init) => {
      calls += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.response_format.json_schema.name, 'upgradelens_debug_exact_schema');
      assert.deepEqual(body.response_format.json_schema.schema, AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
      return probeResponse(false);
    }
  });
  assert.equal(calls, 1);
  assert.equal(run.requestCount, 1);
  assert.equal(run.results[0].probe, 'exact-schema');
});

test('independent report is deterministic and excludes prompts, schemas, credentials, raw events, and account data', async () => {
  const config = loadIsolationConfiguration(ENV);
  const probeRun = await runIndependentProbes(config, {
    fetchImplementation: async (_url, init) => {
      const id = probeName(JSON.parse(init.body));
      return probeResponse(!['probe-b', 'probe-c', 'probe-g', 'probe-h', 'probe-i'].includes(id));
    }
  });
  const debugRun = { results: [], requestCount: 0, maxRequests: 2 };
  const first = serializeIndependentReport({ config, probeRun, debugRun, generatedAt: '2026-07-16T00:00:00.000Z' });
  const second = serializeIndependentReport({ config, probeRun, debugRun, generatedAt: '2026-07-16T00:00:00.000Z' });
  assert.equal(first, second);
  assert.match(first, /## Independent Keyword Probes/);
  assert.match(first, /## OpenRouter Upstream Debug/);
  assert.match(first, /## Causal Conclusion/);
  assert.match(first, /Total OpenRouter requests: 10\/12/);
  assert.doesNotMatch(first, /You are a JSON generator|Return one valid object|sk-or-|Bearer |private raw|private account|"properties"\s*:/);

  const safe = summarizeRequestStructure({
    model: 'test',
    messages: [{ role: 'user', content: 'private message' }],
    stream: true,
    api_key: 'sk-or-v1-secret'
  });
  assert.equal(safe.messageCharacterCounts[0], 15);
  assert.doesNotMatch(JSON.stringify(safe), /private message|sk-or-|secret/);
});
