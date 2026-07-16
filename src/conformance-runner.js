import { buildConformanceReport } from './conformance-report.js';
import { createOpenAiCompatibleProvider } from './openai-compatible-provider.js';
import {
  OFFLINE_CONFORMANCE_ENDPOINT,
  capabilityProfileDigest as digestCapabilityProfile,
  createDefaultGovernanceArtifacts,
  deploymentProfileDigest as digestDeploymentProfile
} from './governance-metadata.js';
import {
  RUNTIME_CONFORMANCE_CASES,
  RUNTIME_CONFORMANCE_OUTPUT_SCHEMA,
  RuntimeConformanceValidationError,
  normalizeConformanceError,
  validateRuntimeConformanceOutput
} from './runtime-conformance.js';

const FIXTURE_ENDPOINT = OFFLINE_CONFORMANCE_ENDPOINT;
const FIXTURE_USAGE = Object.freeze({
  prompt_tokens: 17,
  completion_tokens: 9,
  total_tokens: 26
});

function fixtureSuccessBody(model, transport) {
  const content = transport.content
    ?? JSON.stringify({ status: 'ok', protocol: 'chat-completions' });
  const choice = {
    index: 0,
    message: { role: 'assistant', content },
    finish_reason: 'stop'
  };
  const body = {
    id: 'offline-conformance-response',
    model: transport.returnedModel ?? model,
    usage: { ...FIXTURE_USAGE }
  };
  if (!transport.omitChoices) {
    body.choices = transport.choiceCount === 2
      ? [choice, { ...choice, index: 1 }]
      : [choice];
  }
  return body;
}

function jsonResponse(body, { status = 200, contentType = 'application/json' } = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType }
  });
}

function waitForAbort(signal) {
  return new Promise((resolve, reject) => {
    const rejectAbort = () => reject(new DOMException('Fixture request aborted.', 'AbortError'));
    if (signal.aborted) rejectAbort();
    else signal.addEventListener('abort', rejectAbort, { once: true });
  });
}

function createFixtureFetch(caseDefinition, runtime, observations) {
  return async (_url, init) => {
    observations.authorization = init.headers.authorization ?? null;
    observations.redirect = init.redirect;
    observations.requestBody = JSON.parse(init.body);
    const transport = caseDefinition.transport;
    if (transport.type === 'networkError') throw new TypeError('Offline fixture network failure.');
    if (transport.type === 'waitForAbort') return waitForAbort(init.signal);
    if (transport.type === 'redirect') throw new TypeError('Offline fixture redirect rejected.');
    if (transport.type === 'malformedJson') return jsonResponse('{malformed');
    if (transport.type === 'oversized') {
      return new Response('x'.repeat(512), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': '512'
        }
      });
    }
    if (transport.type === 'httpError') {
      return jsonResponse({
        error: {
          message: transport.descriptor ?? `offline fixture HTTP ${transport.status}`
        }
      }, { status: transport.status });
    }
    return jsonResponse(fixtureSuccessBody(runtime.model, transport), {
      contentType: transport.contentType
    });
  };
}

function runtimeRequest(caseDefinition, signal) {
  return {
    contractVersion: '1.0.0',
    runId: `conformance:${caseDefinition.id}`,
    contextId: 'offline-runtime-conformance',
    task: 'runtime-conformance.v1',
    promptVersion: '1.0.0',
    systemPrompt: 'Return the fixed runtime conformance object.',
    userPrompt: 'Return status ok and protocol chat-completions.',
    structuredOutput: {
      mode: caseDefinition.mode,
      name: 'upgradelens_runtime_conformance',
      schema: RUNTIME_CONFORMANCE_OUTPUT_SCHEMA
    },
    ...(signal ? { signal } : {})
  };
}

function assertionError(code, message) {
  throw new RuntimeConformanceValidationError(code, message);
}

function validateAssertions(caseDefinition, result, observations, runtime) {
  for (const assertion of caseDefinition.assertions) {
    if (assertion === 'outputSchema') validateRuntimeConformanceOutput(result.output);
    else if (assertion === 'noAuthorization' && observations.authorization !== null) {
      assertionError('AUTH_MAPPING_INVALID', 'No-auth request unexpectedly sent authorization.');
    } else if (assertion === 'bearerAuthorization'
      && observations.authorization !== caseDefinition.authorization) {
      assertionError('AUTH_MAPPING_INVALID', 'Bearer authorization was not forwarded exactly.');
    } else if (assertion === 'structuredRequest') {
      const format = observations.requestBody?.response_format;
      if (format?.type !== 'json_schema'
        || format.json_schema?.strict !== true
        || JSON.stringify(format.json_schema.schema) !== JSON.stringify(RUNTIME_CONFORMANCE_OUTPUT_SCHEMA)
        || observations.requestBody.stream !== false) {
        assertionError('REQUEST_MAPPING_INVALID', 'JSON Schema request mapping is not exact.');
      }
    } else if (assertion === 'usage') {
      if (result.usage.inputTokens !== FIXTURE_USAGE.prompt_tokens
        || result.usage.outputTokens !== FIXTURE_USAGE.completion_tokens
        || result.usage.totalTokens !== FIXTURE_USAGE.total_tokens) {
        assertionError('USAGE_MAPPING_INVALID', 'Token usage was not mapped exactly.');
      }
    } else if (assertion === 'identity') {
      if (result.requestedModel !== runtime.model
        || result.model !== runtime.model
        || result.actualModel !== runtime.model) {
        assertionError('IDENTITY_MAPPING_INVALID', 'Configured and returned model identities do not match.');
      }
    } else if (assertion === 'redirectErrorMode' && observations.redirect !== 'error') {
      assertionError('REDIRECT_PROTECTION_INVALID', 'Fetch redirect mode was not set to error.');
    }
  }
}

export function createOfflineConformanceExecutor({
  providerFactory = createOpenAiCompatibleProvider
} = {}) {
  return async function executeConformanceCase(caseDefinition, runtime) {
    if (caseDefinition.transport.type === 'unknownError') {
      try {
        throw new Error('Offline fixture unknown error.');
      } catch (error) {
        return { outcome: normalizeConformanceError(error) };
      }
    }

    const observations = {};
    const provider = providerFactory({
      endpoint: FIXTURE_ENDPOINT,
      model: runtime.model,
      provider: runtime.provider,
      authorization: caseDefinition.authorization,
      fetchImplementation: createFixtureFetch(caseDefinition, runtime, observations),
      timeoutMs: caseDefinition.id === 'timeout-classification' ? 10 : 1_000,
      maxResponseBytes: caseDefinition.transport.type === 'oversized' ? 64 : 2_048,
      requireExactModelIdentity: caseDefinition.requireExactModelIdentity
    });
    const callerController = caseDefinition.assertions.includes('callerAbort')
      ? new AbortController()
      : null;

    try {
      const pending = provider.generateStructured(runtimeRequest(caseDefinition, callerController?.signal));
      if (callerController) callerController.abort();
      const result = await pending;
      validateAssertions(caseDefinition, result, observations, runtime);
      return { outcome: 'SUCCESS' };
    } catch (error) {
      try {
        if (caseDefinition.assertions.includes('redirectErrorMode') && observations.redirect !== 'error') {
          assertionError('REDIRECT_PROTECTION_INVALID', 'Fetch redirect mode was not set to error.');
        }
      } catch (assertionFailure) {
        return { outcome: normalizeConformanceError(assertionFailure) };
      }
      return { outcome: normalizeConformanceError(error) };
    }
  };
}

function validateRuntimeProfile(runtime) {
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
    throw new TypeError('Conformance runtime profile must be an object.');
  }
  if (typeof runtime.provider !== 'string' || runtime.provider.trim().length === 0) {
    throw new TypeError('Conformance runtime provider is required.');
  }
  if (typeof runtime.model !== 'string' || runtime.model.trim().length === 0) {
    throw new TypeError('Conformance runtime model is required.');
  }
  return { provider: runtime.provider, model: runtime.model };
}

export async function runConformance({
  runtime = { provider: 'openai-compatible', model: 'offline-fixture' },
  cases = RUNTIME_CONFORMANCE_CASES,
  capabilityProfileDigest,
  deploymentProfileDigest,
  conformanceScope = 'offline-runtime-protocol',
  generatedAt = new Date()
} = {}, {
  executeCase = createOfflineConformanceExecutor()
} = {}) {
  const profile = validateRuntimeProfile(runtime);
  const governance = createDefaultGovernanceArtifacts({
    provider: profile.provider,
    endpoint: FIXTURE_ENDPOINT,
    model: profile.model
  });
  const caseResults = [];
  for (const caseDefinition of cases) {
    let observed;
    try {
      const result = await executeCase(caseDefinition, profile);
      observed = typeof result?.outcome === 'string' ? result.outcome : 'UNKNOWN';
    } catch (error) {
      observed = normalizeConformanceError(error);
    }
    caseResults.push({
      id: caseDefinition.id,
      capability: caseDefinition.capability,
      capabilities: caseDefinition.capabilities,
      required: caseDefinition.required,
      capabilityStatus: caseDefinition.capabilityStatusByOutcome[observed] ?? 'PASS',
      status: caseDefinition.accepted.includes(observed) ? 'PASS' : 'FAIL',
      expected: caseDefinition.expected,
      observed
    });
  }
  return buildConformanceReport({
    runtime: profile,
    caseResults,
    deploymentProfileDigest: deploymentProfileDigest
      ?? digestDeploymentProfile(governance.deploymentProfile),
    capabilityProfileDigest: capabilityProfileDigest
      ?? digestCapabilityProfile(governance.capabilityProfile),
    conformanceScope,
    generatedAt
  });
}
