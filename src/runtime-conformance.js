import Ajv2020 from 'ajv/dist/2020.js';

import { isAiRuntimeError } from './ai-runtime-error.js';

export const RUNTIME_CONFORMANCE_OUTPUT_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['status', 'protocol'],
  properties: {
    status: { const: 'ok' },
    protocol: { const: 'chat-completions' }
  }
});

export const RUNTIME_CONFORMANCE_CAPABILITIES = Object.freeze([
  'connectivity',
  'authentication',
  'timeout',
  'cancellation',
  'structuredOutput',
  'jsonSchema',
  'jsonMode',
  'responseValidation',
  'usage',
  'identity',
  'contentType',
  'httpErrors',
  'oversizedResponse',
  'redirectProtection',
  'providerErrors'
]);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateOutputSchema = ajv.compile(RUNTIME_CONFORMANCE_OUTPUT_SCHEMA);

export class RuntimeConformanceValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RuntimeConformanceValidationError';
    this.code = code;
  }
}

export function validateRuntimeConformanceOutput(output) {
  let candidate;
  try {
    candidate = JSON.parse(output);
  } catch {
    throw new RuntimeConformanceValidationError(
      'INVALID_OUTPUT_JSON',
      'Runtime output is not valid JSON.'
    );
  }
  if (!validateOutputSchema(candidate)) {
    throw new RuntimeConformanceValidationError(
      'INVALID_OUTPUT_SCHEMA',
      'Runtime output does not satisfy the conformance schema.'
    );
  }
  return candidate;
}

function defineCase({
  id,
  capability,
  capabilities = [capability],
  expected = 'SUCCESS',
  accepted = [expected],
  transport,
  required = true,
  capabilityStatusByOutcome = {},
  authorization,
  mode = 'jsonSchema',
  requireExactModelIdentity = false,
  assertions = []
}) {
  return Object.freeze({
    id,
    capability,
    capabilities: Object.freeze([...capabilities]),
    expected,
    accepted: Object.freeze([...accepted]),
    transport: Object.freeze({ ...transport }),
    required,
    capabilityStatusByOutcome: Object.freeze({ ...capabilityStatusByOutcome }),
    authorization,
    mode,
    requireExactModelIdentity,
    assertions: Object.freeze([...assertions])
  });
}

const HTTP_ERROR_CASES = [
  [401, 'AUTH_ERROR'],
  [403, 'AUTH_ERROR'],
  [404, 'MODEL_NOT_FOUND', 'model_not_found: configured model does not exist'],
  [408, 'TIMEOUT'],
  [409, 'PROVIDER_ERROR'],
  [422, 'SCHEMA_REJECTED', 'invalid json_schema supplied'],
  [429, 'RATE_LIMITED'],
  [500, 'PROVIDER_ERROR'],
  [502, 'PROVIDER_UNAVAILABLE'],
  [503, 'PROVIDER_UNAVAILABLE'],
  [504, 'TIMEOUT']
].map(([status, expected, descriptor]) => defineCase({
  id: `http-${status}`,
  capability: 'httpErrors',
  expected,
  transport: { type: 'httpError', status, descriptor }
}));

export const RUNTIME_CONFORMANCE_CASES = Object.freeze([
  defineCase({
    id: 'connectivity-reachable',
    capability: 'connectivity',
    transport: { type: 'success' },
    assertions: ['outputSchema']
  }),
  defineCase({
    id: 'connectivity-unreachable',
    capability: 'connectivity',
    expected: 'NETWORK_ERROR',
    transport: { type: 'networkError' }
  }),
  defineCase({
    id: 'authentication-none',
    capability: 'authentication',
    transport: { type: 'success' },
    assertions: ['noAuthorization']
  }),
  defineCase({
    id: 'authentication-bearer',
    capability: 'authentication',
    authorization: 'Bearer conformance-fixture-token',
    transport: { type: 'success' },
    assertions: ['bearerAuthorization']
  }),
  defineCase({
    id: 'authentication-invalid',
    capability: 'authentication',
    authorization: 'Bearer invalid-conformance-fixture-token',
    expected: 'AUTH_ERROR',
    transport: { type: 'httpError', status: 401 }
  }),
  defineCase({
    id: 'timeout-classification',
    capability: 'timeout',
    expected: 'TIMEOUT',
    transport: { type: 'waitForAbort' }
  }),
  defineCase({
    id: 'cancellation-propagation',
    capability: 'cancellation',
    expected: 'CANCELLED',
    transport: { type: 'waitForAbort' },
    assertions: ['callerAbort']
  }),
  defineCase({
    id: 'structured-output-json-schema',
    capability: 'structuredOutput',
    capabilities: ['structuredOutput', 'jsonSchema'],
    transport: { type: 'success' },
    assertions: ['structuredRequest', 'outputSchema']
  }),
  defineCase({
    id: 'json-mode-capability',
    capability: 'jsonMode',
    expected: 'SUCCESS_OR_STRUCTURED_OUTPUT_UNSUPPORTED',
    accepted: ['SUCCESS', 'STRUCTURED_OUTPUT_UNSUPPORTED'],
    transport: { type: 'success' },
    required: false,
    capabilityStatusByOutcome: { STRUCTURED_OUTPUT_UNSUPPORTED: 'NOT_SUPPORTED' },
    mode: 'json'
  }),
  defineCase({
    id: 'response-empty-content',
    capability: 'responseValidation',
    expected: 'INVALID_RESPONSE',
    transport: { type: 'success', content: '   ' }
  }),
  defineCase({
    id: 'response-multiple-choices',
    capability: 'responseValidation',
    expected: 'INVALID_RESPONSE',
    transport: { type: 'success', choiceCount: 2 }
  }),
  defineCase({
    id: 'response-missing-choices',
    capability: 'responseValidation',
    expected: 'INVALID_RESPONSE',
    transport: { type: 'success', omitChoices: true }
  }),
  defineCase({
    id: 'response-malformed-json',
    capability: 'responseValidation',
    expected: 'INVALID_RESPONSE',
    transport: { type: 'malformedJson' }
  }),
  defineCase({
    id: 'response-invalid-output-schema',
    capability: 'responseValidation',
    expected: 'INVALID_OUTPUT_SCHEMA',
    transport: { type: 'success', content: '{"status":"wrong","protocol":"chat-completions"}' },
    assertions: ['outputSchema']
  }),
  defineCase({
    id: 'usage-mapping',
    capability: 'usage',
    transport: { type: 'success' },
    assertions: ['usage']
  }),
  defineCase({
    id: 'identity-match',
    capability: 'identity',
    transport: { type: 'success' },
    requireExactModelIdentity: true,
    assertions: ['identity']
  }),
  defineCase({
    id: 'identity-mismatch',
    capability: 'identity',
    expected: 'IDENTITY_MISMATCH',
    transport: { type: 'success', returnedModel: 'different-offline-model' },
    requireExactModelIdentity: true
  }),
  defineCase({
    id: 'content-type-invalid',
    capability: 'contentType',
    expected: 'INVALID_RESPONSE',
    transport: { type: 'success', contentType: 'text/plain' }
  }),
  ...HTTP_ERROR_CASES,
  defineCase({
    id: 'response-oversized',
    capability: 'oversizedResponse',
    expected: 'RESPONSE_TOO_LARGE',
    transport: { type: 'oversized' }
  }),
  defineCase({
    id: 'redirect-rejected',
    capability: 'redirectProtection',
    expected: 'NETWORK_ERROR',
    transport: { type: 'redirect' },
    assertions: ['redirectErrorMode']
  }),
  defineCase({
    id: 'structured-output-unsupported',
    capability: 'providerErrors',
    expected: 'STRUCTURED_OUTPUT_UNSUPPORTED',
    transport: {
      type: 'httpError',
      status: 422,
      descriptor: 'response_format json_schema is not supported'
    }
  }),
  defineCase({
    id: 'provider-error-classification',
    capability: 'providerErrors',
    expected: 'PROVIDER_ERROR',
    transport: { type: 'httpError', status: 418 }
  }),
  defineCase({
    id: 'unknown-error-classification',
    capability: 'providerErrors',
    expected: 'UNKNOWN',
    transport: { type: 'unknownError' }
  })
]);

export function normalizeConformanceError(error) {
  if (isAiRuntimeError(error)) return error.code;
  if (error instanceof RuntimeConformanceValidationError) return error.code;
  return 'UNKNOWN';
}
