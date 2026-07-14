const JSON_MEDIA_TYPE = /^(?:application\/(?:json|[a-z0-9.+-]+\+json))(?:\s*;|$)/i;

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

async function readBoundedText(response, maxResponseBytes, { errorPrefix, serviceName }) {
  const declaredLength = headerValue(response.headers, 'content-length');
  if (declaredLength !== null && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxResponseBytes) {
    throw new BoundedFetchError(`${errorPrefix}_RESPONSE_TOO_LARGE`, `${serviceName} response exceeds the configured size limit.`);
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    throw new BoundedFetchError(`${errorPrefix}_RESPONSE_INVALID`, `${serviceName} response body is not readable.`);
  }

  const chunks = [];
  let byteCount = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      byteCount += chunk.length;
      if (byteCount > maxResponseBytes) {
        await reader.cancel();
        throw new BoundedFetchError(`${errorPrefix}_RESPONSE_TOO_LARGE`, `${serviceName} response exceeds the configured size limit.`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Fetch one registry JSON representation without allowing an unbounded body
 * into memory. Redirects are explicitly disabled in this small adapter.
 */
export async function fetchRegistryJson(url, {
  fetchImplementation = globalThis.fetch,
  timeoutMs = 10_000,
  maxResponseBytes = 1_000_000,
  userAgent = 'UpgradeLens/0.1.1',
  errorPrefix = 'NPM',
  serviceName = 'npm Registry'
} = {}) {
  if (typeof fetchImplementation !== 'function') {
    throw new BoundedFetchError(`${errorPrefix}_REQUEST_INVALID`, 'A WHATWG-compatible fetch implementation is required.');
  }
  validLimit(timeoutMs, 'timeoutMs', errorPrefix);
  validLimit(maxResponseBytes, 'maxResponseBytes', errorPrefix);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
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
  } finally {
    clearTimeout(timer);
  }

  if (!response || !Number.isInteger(response.status)) {
    throw new BoundedFetchError(`${errorPrefix}_RESPONSE_INVALID`, `${serviceName} returned an invalid HTTP response.`);
  }
  if (response.status !== 200) return { status: response.status, body: null };

  const contentType = headerValue(response.headers, 'content-type');
  if (!contentType || !JSON_MEDIA_TYPE.test(contentType)) {
    throw new BoundedFetchError(`${errorPrefix}_RESPONSE_INVALID`, `${serviceName} response must use a JSON media type.`);
  }

  const text = await readBoundedText(response, maxResponseBytes, { errorPrefix, serviceName });
  try {
    return { status: 200, body: JSON.parse(text) };
  } catch {
    throw new BoundedFetchError(`${errorPrefix}_RESPONSE_INVALID`, `${serviceName} response is not valid JSON.`);
  }
}

export function fetchNpmJson(url, options = {}) {
  return fetchRegistryJson(url, { ...options, errorPrefix: 'NPM', serviceName: 'npm Registry' });
}
