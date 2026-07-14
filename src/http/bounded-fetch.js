import { USER_AGENT } from '../constants.js';

const JSON_MEDIA_TYPE = /^(?:application\/(?:json|[a-z0-9.+-]+\+json))(?:\s*;|$)/i;

/**
 * Adapter configuration is intentionally bounded even though the transport
 * helper itself can enforce any positive safe integer supplied by a caller.
 */
export const MAX_REGISTRY_RESPONSE_BYTES = 64 * 1024 * 1024;

export class BoundedFetchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BoundedFetchError';
    this.code = code;
  }
}

function headerValue(headers, name) {
  if (!headers || typeof headers.get !== 'function') return null;
  return headers.get(name);
}

function validLimit(value, name, errorPrefix) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new BoundedFetchError(`${errorPrefix}_REQUEST_INVALID`, `${name} must be a positive integer.`);
  }
}

/** Validate an adapter-owned response limit without imposing a shared default. */
export function validateRegistryResponseLimit(value, {
  errorPrefix = 'HTTP',
  maximum = MAX_REGISTRY_RESPONSE_BYTES
} = {}) {
  validLimit(value, 'maxResponseBytes', errorPrefix);
  if (value > maximum) {
    throw new BoundedFetchError(
      `${errorPrefix}_REQUEST_INVALID`,
      `maxResponseBytes must not exceed ${maximum} bytes.`
    );
  }
  return value;
}

async function discardResponseBody(response) {
  try {
    await response?.body?.cancel?.();
  } catch {
    // Cleanup cannot change a sanitized registry result.
  }
}

async function readBoundedText(response, maxResponseBytes, { errorPrefix, serviceName }) {
  const declaredLength = headerValue(response.headers, 'content-length');
  if (declaredLength !== null && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxResponseBytes) {
    await discardResponseBody(response);
    throw new BoundedFetchError(`${errorPrefix}_RESPONSE_TOO_LARGE`, `${serviceName} response exceeds the configured size limit.`);
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    return readFallbackText(response, maxResponseBytes, { errorPrefix, serviceName });
  }

  const chunks = [];
  let byteCount = 0;
  let completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      const chunk = Buffer.from(value);
      byteCount += chunk.length;
      if (byteCount > maxResponseBytes) {
        throw new BoundedFetchError(`${errorPrefix}_RESPONSE_TOO_LARGE`, `${serviceName} response exceeds the configured size limit.`);
      }
      chunks.push(chunk);
    }
  } finally {
    if (!completed) {
      try {
        await reader.cancel?.();
      } catch {
        // Cleanup cannot change a sanitized registry result.
      }
    }
    try {
      reader.releaseLock?.();
    } catch {
      // Cleanup cannot change a sanitized registry result.
    }
    if (!completed) await discardResponseBody(response);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readFallbackText(response, maxResponseBytes, { errorPrefix, serviceName }) {
  const read = typeof response?.text === 'function'
    ? () => response.text()
    : typeof response?.body?.text === 'function'
      ? () => response.body.text()
      : null;
  if (!read) {
    await discardResponseBody(response);
    throw new BoundedFetchError(`${errorPrefix}_RESPONSE_INVALID`, `${serviceName} response body is not readable.`);
  }

  let completed = false;
  try {
    const text = await read();
    if (Buffer.byteLength(String(text), 'utf8') > maxResponseBytes) {
      throw new BoundedFetchError(`${errorPrefix}_RESPONSE_TOO_LARGE`, `${serviceName} response exceeds the configured size limit.`);
    }
    completed = true;
    return String(text);
  } finally {
    if (!completed) await discardResponseBody(response);
  }
}

/**
 * Fetch one registry JSON representation without allowing an unbounded body
 * into memory. Redirects are explicitly disabled in this small adapter.
 */
export async function fetchRegistryJson(url, {
  fetchImplementation = globalThis.fetch,
  timeoutMs = 10_000,
  maxResponseBytes,
  userAgent = USER_AGENT,
  errorPrefix = 'NPM',
  serviceName = 'npm Registry',
  setTimeoutImplementation = setTimeout,
  clearTimeoutImplementation = clearTimeout
} = {}) {
  if (typeof fetchImplementation !== 'function') {
    throw new BoundedFetchError(`${errorPrefix}_REQUEST_INVALID`, 'A WHATWG-compatible fetch implementation is required.');
  }
  validLimit(timeoutMs, 'timeoutMs', errorPrefix);
  validLimit(maxResponseBytes, 'maxResponseBytes', errorPrefix);
  if (typeof setTimeoutImplementation !== 'function' || typeof clearTimeoutImplementation !== 'function') {
    throw new BoundedFetchError(`${errorPrefix}_REQUEST_INVALID`, 'Timer implementations must be functions.');
  }

  const controller = new AbortController();
  const timer = setTimeoutImplementation(() => controller.abort(), timeoutMs);
  let response;
  try {
    try {
      response = await fetchImplementation(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': userAgent
        },
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error'
      });
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new BoundedFetchError(`${errorPrefix}_REQUEST_TIMEOUT`, `${serviceName} request timed out.`);
      }
      throw new BoundedFetchError(`${errorPrefix}_TRANSPORT_FAILED`, `${serviceName} request failed.`);
    }

    if (!response || !Number.isInteger(response.status)) {
      await discardResponseBody(response);
      throw new BoundedFetchError(`${errorPrefix}_RESPONSE_INVALID`, `${serviceName} returned an invalid HTTP response.`);
    }
    if (response.status !== 200) {
      await discardResponseBody(response);
      return { status: response.status, body: null };
    }

    const contentType = headerValue(response.headers, 'content-type');
    if (!contentType || !JSON_MEDIA_TYPE.test(contentType)) {
      await discardResponseBody(response);
      throw new BoundedFetchError(`${errorPrefix}_RESPONSE_INVALID`, `${serviceName} response must use a JSON media type.`);
    }

    let text;
    try {
      text = await readBoundedText(response, maxResponseBytes, { errorPrefix, serviceName });
    } catch (error) {
      if (error instanceof BoundedFetchError) throw error;
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new BoundedFetchError(`${errorPrefix}_REQUEST_TIMEOUT`, `${serviceName} request timed out.`);
      }
      throw new BoundedFetchError(`${errorPrefix}_TRANSPORT_FAILED`, `${serviceName} response could not be read.`);
    }
    try {
      return { status: 200, body: JSON.parse(text) };
    } catch {
      throw new BoundedFetchError(`${errorPrefix}_RESPONSE_INVALID`, `${serviceName} response is not valid JSON.`);
    }
  } finally {
    clearTimeoutImplementation(timer);
  }
}

export function fetchNpmJson(url, options = {}) {
  return fetchRegistryJson(url, { ...options, errorPrefix: 'NPM', serviceName: 'npm Registry' });
}
