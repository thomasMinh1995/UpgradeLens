export const AI_RUNTIME_ERROR_CODES = Object.freeze([
  'CONFIGURATION_ERROR',
  'AUTH_ERROR',
  'MODEL_NOT_FOUND',
  'NETWORK_ERROR',
  'TIMEOUT',
  'CANCELLED',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'SCHEMA_REJECTED',
  'STRUCTURED_OUTPUT_UNSUPPORTED',
  'INVALID_RESPONSE',
  'OUTPUT_TRUNCATED',
  'CONTENT_REFUSED',
  'RESPONSE_TOO_LARGE',
  'PROVIDER_ERROR',
  'IDENTITY_MISMATCH',
  'UNKNOWN'
]);

const ERROR_CODE_SET = new Set(AI_RUNTIME_ERROR_CODES);

export class AiRuntimeError extends Error {
  constructor(code, message, { status, retryable = false } = {}) {
    if (!ERROR_CODE_SET.has(code)) throw new TypeError('Unknown AI runtime error code.');
    super(message);
    this.name = 'AiRuntimeError';
    this.code = code;
    this.retryable = retryable === true;
    if (Number.isInteger(status)) this.status = status;
  }
}

export function isAiRuntimeError(error) {
  return error instanceof AiRuntimeError
    && ERROR_CODE_SET.has(error.code)
    && typeof error.message === 'string'
    && typeof error.retryable === 'boolean';
}
