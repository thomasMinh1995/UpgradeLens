import { AiRuntimeError, isAiRuntimeError } from './ai-runtime-error.js';

export const DEFAULT_AI_TIMEOUT_MS = 60_000;
export const DEFAULT_AI_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const JSON_MEDIA_TYPE = /^(?:application\/(?:json|[a-z0-9.+-]+\+json))(?:\s*;|$)/i;
const COMPLETED_FINISH_REASONS = new Set(['stop']);
const REFUSAL_FINISH_REASONS = new Set(['content_filter', 'safety']);
const ALLOWED_REQUEST_EXTRA_FIELDS = new Set([
  'temperature',
  'top_p',
  'max_tokens',
  'max_completion_tokens',
  'seed'
]);

function configurationError(message) {
  return new AiRuntimeError('CONFIGURATION_ERROR', message);
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw configurationError(`${name} must be a positive integer.`);
  }
  return value;
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  return normalized === 'localhost'
    || normalized === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

export function validateOpenAiCompatibleEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw configurationError('OpenAI-compatible endpoint is required.');
  }
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw configurationError('OpenAI-compatible endpoint must be a valid URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw configurationError('OpenAI-compatible endpoint must use HTTP or HTTPS.');
  }
  if (url.username || url.password) {
    throw configurationError('OpenAI-compatible endpoint must not contain credentials.');
  }
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    throw configurationError('Remote OpenAI-compatible endpoints must use HTTPS.');
  }
  return url;
}

function headerValue(headers, name) {
  return headers && typeof headers.get === 'function' ? headers.get(name) : null;
}

async function discardBody(response) {
  try {
    await response?.body?.cancel?.();
  } catch {
    // Cleanup cannot change the sanitized provider result.
  }
}

async function readFallbackText(response, maxResponseBytes) {
  if (typeof response?.text !== 'function') {
    await discardBody(response);
    throw new AiRuntimeError('INVALID_RESPONSE', 'AI provider response body is not readable.');
  }
  const text = String(await response.text());
  if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) {
    throw new AiRuntimeError('RESPONSE_TOO_LARGE', 'AI provider response exceeded the configured size limit.');
  }
  return text;
}

async function readBoundedText(response, maxResponseBytes) {
  const declaredLength = headerValue(response?.headers, 'content-length');
  if (declaredLength !== null && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > maxResponseBytes) {
    await discardBody(response);
    throw new AiRuntimeError('RESPONSE_TOO_LARGE', 'AI provider response exceeded the configured size limit.');
  }

  const reader = response?.body?.getReader?.();
  if (!reader) return readFallbackText(response, maxResponseBytes);

  const chunks = [];
  let byteCount = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        break;
      }
      const chunk = Buffer.from(value);
      byteCount += chunk.length;
      if (byteCount > maxResponseBytes) {
        throw new AiRuntimeError('RESPONSE_TOO_LARGE', 'AI provider response exceeded the configured size limit.');
      }
      chunks.push(chunk);
    }
  } finally {
    if (!complete) {
      try {
        await reader.cancel?.();
      } catch {
        // Cleanup cannot change the sanitized provider result.
      }
    }
    try {
      reader.releaseLock?.();
    } catch {
      // Cleanup cannot change the sanitized provider result.
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

function safeErrorDescriptor(text) {
  try {
    const body = JSON.parse(text);
    const error = body && typeof body === 'object' ? body.error : null;
    if (typeof error === 'string') return error.slice(0, 512).toLowerCase();
    if (!error || typeof error !== 'object') return '';
    return [error.code, error.type, error.message]
      .filter((value) => typeof value === 'string')
      .join(' ')
      .slice(0, 512)
      .toLowerCase();
  } catch {
    return '';
  }
}

function httpError(status, responseText) {
  const descriptor = safeErrorDescriptor(responseText);
  const mentionsSchema = /json[_ -]?schema|response[_ -]?format|structured[_ -]?output|schema/.test(descriptor);
  const unsupported = /unsupported|not supported|unknown (?:field|parameter)|unrecognized/.test(descriptor);
  const modelMissing = /model[_ -]?not[_ -]?found|no such model|unknown model|model does not exist/.test(descriptor);

  if (status === 401 || status === 403) {
    return new AiRuntimeError('AUTH_ERROR', 'AI provider rejected authorization.', { status });
  }
  if (status === 404 && modelMissing) {
    return new AiRuntimeError('MODEL_NOT_FOUND', 'Configured AI model was not found.', { status });
  }
  if (status === 408 || status === 504) {
    return new AiRuntimeError('TIMEOUT', 'AI provider request timed out.', { status, retryable: true });
  }
  if (status === 429) {
    return new AiRuntimeError('RATE_LIMITED', 'AI provider rate limit was reached.', { status, retryable: true });
  }
  if (status === 502 || status === 503) {
    return new AiRuntimeError('PROVIDER_UNAVAILABLE', 'AI provider is temporarily unavailable.', { status, retryable: true });
  }
  if (mentionsSchema && unsupported) {
    return new AiRuntimeError(
      'STRUCTURED_OUTPUT_UNSUPPORTED',
      'AI provider does not support the required structured output mode.',
      { status }
    );
  }
  if (mentionsSchema) {
    return new AiRuntimeError('SCHEMA_REJECTED', 'AI provider rejected the required output schema.', { status });
  }
  return new AiRuntimeError('PROVIDER_ERROR', 'AI provider returned an unsuccessful response.', { status });
}

function nullableToken(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeUsage(usage) {
  return {
    inputTokens: nullableToken(usage?.prompt_tokens),
    outputTokens: nullableToken(usage?.completion_tokens),
    totalTokens: nullableToken(usage?.total_tokens)
  };
}

function validateSuccessEnvelope(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.choices) || body.choices.length !== 1) {
    throw new AiRuntimeError('INVALID_RESPONSE', 'AI provider returned an invalid response envelope.');
  }
  const choice = body.choices[0];
  const message = choice?.message;
  const finishReason = choice?.finish_reason;

  if (finishReason === 'length') {
    throw new AiRuntimeError('OUTPUT_TRUNCATED', 'AI provider output was truncated.');
  }
  if (REFUSAL_FINISH_REASONS.has(finishReason) || (typeof message?.refusal === 'string' && message.refusal.length > 0)) {
    throw new AiRuntimeError('CONTENT_REFUSED', 'AI provider refused the requested content.');
  }
  if (message?.tool_calls?.length > 0 || message?.function_call || ['tool_calls', 'function_call'].includes(finishReason)) {
    throw new AiRuntimeError('INVALID_RESPONSE', 'AI provider returned a tool call instead of final content.');
  }
  if (!COMPLETED_FINISH_REASONS.has(finishReason)) {
    throw new AiRuntimeError('INVALID_RESPONSE', 'AI provider did not return a completed response.');
  }
  if (!message || message.role !== 'assistant'
    || typeof message.content !== 'string' || message.content.trim().length === 0) {
    throw new AiRuntimeError('INVALID_RESPONSE', 'AI provider returned no usable assistant content.');
  }
  return message.content;
}

function validateStructuredRequest(request) {
  if (typeof request?.systemPrompt !== 'string' || typeof request?.userPrompt !== 'string') {
    throw configurationError('Runtime request requires rendered systemPrompt and userPrompt.');
  }
  const structuredOutput = request.structuredOutput;
  if (structuredOutput?.mode !== 'jsonSchema') {
    throw new AiRuntimeError(
      'STRUCTURED_OUTPUT_UNSUPPORTED',
      'Runtime request requires JSON Schema structured output.'
    );
  }
  if (!structuredOutput.schema || typeof structuredOutput.schema !== 'object' || Array.isArray(structuredOutput.schema)) {
    throw configurationError('Runtime request requires an exact output schema.');
  }
  if (typeof structuredOutput.name !== 'string'
    || !/^[A-Za-z0-9_-]{1,64}$/.test(structuredOutput.name)) {
    throw configurationError('Runtime request requires a valid deterministic schema name.');
  }
  return structuredOutput;
}

function createRequestBody(request, model, requestExtras) {
  const structuredOutput = validateStructuredRequest(request);
  const allowedExtras = Object.fromEntries(
    Object.entries(requestExtras).filter(([key]) => ALLOWED_REQUEST_EXTRA_FIELDS.has(key))
  );
  return {
    ...structuredClone(allowedExtras),
    model,
    messages: [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: structuredOutput.name,
        strict: true,
        schema: structuredClone(structuredOutput.schema)
      }
    },
    stream: false
  };
}

/**
 * Non-streaming provider for the common OpenAI-compatible Chat Completions
 * wire protocol. It does not parse or validate the task candidate JSON.
 */
export function createOpenAiCompatibleProvider({
  endpoint,
  model,
  authorization,
  provider = 'openai-compatible',
  fetchImplementation = globalThis.fetch,
  timeoutMs = DEFAULT_AI_TIMEOUT_MS,
  maxResponseBytes = DEFAULT_AI_MAX_RESPONSE_BYTES,
  requestExtras = {},
  requireExactModelIdentity = false,
  clock = Date
} = {}) {
  const url = validateOpenAiCompatibleEndpoint(endpoint);
  if (typeof model !== 'string' || model.trim().length === 0) {
    throw configurationError('OpenAI-compatible model is required.');
  }
  if (typeof fetchImplementation !== 'function') {
    throw configurationError('A WHATWG-compatible fetch implementation is required.');
  }
  if (authorization !== undefined && typeof authorization !== 'string') {
    throw configurationError('OpenAI-compatible authorization must be a string when provided.');
  }
  if (!requestExtras || typeof requestExtras !== 'object' || Array.isArray(requestExtras)) {
    throw configurationError('OpenAI-compatible request extras must be an object.');
  }
  positiveInteger(timeoutMs, 'timeoutMs');
  positiveInteger(maxResponseBytes, 'maxResponseBytes');

  return {
    name: provider,
    model,
    async generateStructured(request) {
      const startedAt = clock.now();
      let serializedBody;
      try {
        serializedBody = JSON.stringify(createRequestBody(request, model, requestExtras));
      } catch (error) {
        if (isAiRuntimeError(error)) throw error;
        throw configurationError('OpenAI-compatible request could not be serialized.');
      }
      const controller = new AbortController();
      let timedOut = false;
      const onCallerAbort = () => controller.abort();
      if (request?.signal?.aborted) controller.abort();
      else request?.signal?.addEventListener?.('abort', onCallerAbort, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      try {
        let response;
        try {
          response = await fetchImplementation(url, {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              ...(authorization ? { authorization } : {})
            },
            body: serializedBody,
            credentials: 'omit',
            redirect: 'error',
            signal: controller.signal
          });
        } catch (error) {
          if (isAiRuntimeError(error)) throw error;
          if (timedOut) throw new AiRuntimeError('TIMEOUT', 'AI provider request timed out.', { retryable: true });
          if (request?.signal?.aborted || error?.name === 'AbortError') {
            throw new AiRuntimeError('CANCELLED', 'AI provider request was cancelled.');
          }
          throw new AiRuntimeError('NETWORK_ERROR', 'AI provider network request failed.', { retryable: true });
        }

        if (!response || !Number.isInteger(response.status)) {
          await discardBody(response);
          throw new AiRuntimeError('INVALID_RESPONSE', 'AI provider returned an invalid HTTP response.');
        }
        let text;
        try {
          text = await readBoundedText(response, maxResponseBytes);
        } catch (error) {
          if (timedOut && !isAiRuntimeError(error)) {
            throw new AiRuntimeError('TIMEOUT', 'AI provider request timed out.', { retryable: true });
          }
          throw error;
        }
        if (response.status < 200 || response.status >= 300) throw httpError(response.status, text);

        const contentType = headerValue(response.headers, 'content-type');
        if (!contentType || !JSON_MEDIA_TYPE.test(contentType)) {
          throw new AiRuntimeError('INVALID_RESPONSE', 'AI provider response must use a JSON media type.');
        }
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          throw new AiRuntimeError('INVALID_RESPONSE', 'AI provider response is not valid JSON.');
        }
        const output = validateSuccessEnvelope(body);
        const actualModel = typeof body.model === 'string' && body.model.length > 0 ? body.model : null;
        if (requireExactModelIdentity && actualModel !== model) {
          throw new AiRuntimeError('IDENTITY_MISMATCH', 'AI provider returned an unexpected model identity.');
        }
        return {
          output,
          provider,
          requestedProvider: provider,
          model,
          requestedModel: model,
          actualModel,
          finishReason: 'complete',
          usage: normalizeUsage(body.usage),
          latencyMs: Math.max(0, clock.now() - startedAt),
          providerRequestId: typeof body.id === 'string' && /^[A-Za-z0-9._:-]{1,256}$/.test(body.id)
            ? body.id
            : null,
          attemptCount: 1,
          retryCount: 0,
          fallbackCount: 0,
          fallbackOccurred: false
        };
      } finally {
        clearTimeout(timer);
        request?.signal?.removeEventListener?.('abort', onCallerAbort);
      }
    }
  };
}
