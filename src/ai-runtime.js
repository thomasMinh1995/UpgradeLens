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
