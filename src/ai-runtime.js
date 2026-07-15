export const AI_RUNTIME_CONTRACT_VERSION = '1';

/**
 * @typedef {object} AiRuntimeRequest
 * @property {string} runId
 * @property {string} contextId
 * @property {string} promptVersion
 * @property {object} context
 * @property {object} outputSchema
 */

/**
 * @typedef {object} AiRuntimeResult
 * @property {unknown} output
 * @property {string} provider
 * @property {string} model
 * @property {number} latencyMs
 * @property {{ inputTokens?: number, outputTokens?: number }=} usage
 */

/**
 * Boundary contract for VA-03 model invocation. VA-02 intentionally does not
 * provide a provider implementation or call this interface.
 *
 * @typedef {object} AiRuntime
 * @property {(request: AiRuntimeRequest) => Promise<AiRuntimeResult>} generateStructured
 */

export function validateAiRuntime(runtime) {
  if (!runtime || typeof runtime.generateStructured !== 'function') {
    throw new TypeError('AiRuntime must provide generateStructured(request).');
  }
  return runtime;
}

function runtimeError(message) {
  return new TypeError(`AiRuntime configuration error: ${message}`);
}

function nowMs(clock) {
  return typeof clock?.now === 'function' ? clock.now() : Date.now();
}

/**
 * Create a vendor-neutral runtime around a provider implementation. The
 * provider owns SDK/HTTP details; the runtime owns the stable UpgradeLens
 * request shape and prompt construction.
 */
export function createProviderAiRuntime({
  provider,
  promptBuilder,
  clock
} = {}) {
  if (!provider || typeof provider.generateStructured !== 'function') {
    throw runtimeError('provider must implement generateStructured(request).');
  }
  if (typeof promptBuilder !== 'function') {
    throw runtimeError('promptBuilder must be a function.');
  }

  return validateAiRuntime({
    async generateStructured(request) {
      const startedAt = nowMs(clock);
      const prompt = promptBuilder({
        context: request.context,
        outputSchema: request.outputSchema,
        promptVersion: request.promptVersion
      });
      const response = await provider.generateStructured({
        ...request,
        prompt,
        outputSchema: request.outputSchema
      });
      const latencyMs = Number.isFinite(response?.latencyMs)
        ? response.latencyMs
        : Math.max(0, nowMs(clock) - startedAt);
      return {
        output: response?.output,
        provider: response?.provider ?? provider.name ?? 'unknown',
        model: response?.model ?? provider.model ?? 'unknown',
        latencyMs,
        ...(response?.usage ? { usage: response.usage } : {})
      };
    }
  });
}

/**
 * Minimal generic HTTP provider. It does not know about OpenAI, Gemini,
 * Claude, or any ecosystem; callers provide request/response mapping for the
 * service they choose.
 */
export function createHttpJsonAiProvider({
  endpoint,
  fetchImplementation = globalThis.fetch,
  headers = {},
  model = 'unknown',
  provider = 'http-json',
  buildRequestBody = ({ prompt, outputSchema }) => ({ prompt, outputSchema }),
  extractOutput = (body) => body.output
} = {}) {
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw runtimeError('endpoint is required for the HTTP provider.');
  }
  if (typeof fetchImplementation !== 'function') {
    throw runtimeError('fetchImplementation must be a function.');
  }
  if (typeof buildRequestBody !== 'function') {
    throw runtimeError('buildRequestBody must be a function.');
  }
  if (typeof extractOutput !== 'function') {
    throw runtimeError('extractOutput must be a function.');
  }

  return {
    name: provider,
    model,
    async generateStructured(request) {
      const startedAt = Date.now();
      const response = await fetchImplementation(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...headers
        },
        body: JSON.stringify(buildRequestBody(request))
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`AI provider ${provider} returned HTTP ${response.status}.`);
      }
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`AI provider ${provider} returned invalid JSON.`);
      }
      return {
        output: extractOutput(body),
        provider,
        model,
        latencyMs: Math.max(0, Date.now() - startedAt),
        ...(body.usage ? { usage: body.usage } : {})
      };
    }
  };
}
