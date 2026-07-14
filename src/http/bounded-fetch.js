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

function validLimit(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new BoundedFetchError('NPM_REQUEST_INVALID', `${name} must be a positive integer.`);
  }
}

async function readBoundedText(response, maxResponseBytes) {
  const declaredLength = headerValue(response.headers, 'content-length');
  if (declaredLength !== null && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxResponseBytes) {
    throw new BoundedFetchError('NPM_RESPONSE_TOO_LARGE', 'npm Registry response exceeds the configured size limit.');
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    throw new BoundedFetchError('NPM_RESPONSE_INVALID', 'npm Registry response body is not readable.');
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
        throw new BoundedFetchError('NPM_RESPONSE_TOO_LARGE', 'npm Registry response exceeds the configured size limit.');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Fetch a single npm Registry representation without allowing an unbounded
 * response body into memory. Redirects are explicitly disabled in this small
 * adapter; registry policy can introduce bounded redirect handling later.
 */
export async function fetchNpmJson(url, {
  fetchImplementation = globalThis.fetch,
  timeoutMs = 10_000,
  maxResponseBytes = 1_000_000,
  userAgent = 'UpgradeLens/0.1.1'
} = {}) {
  if (typeof fetchImplementation !== 'function') {
    throw new BoundedFetchError('NPM_REQUEST_INVALID', 'A WHATWG-compatible fetch implementation is required.');
  }
  validLimit(timeoutMs, 'timeoutMs');
  validLimit(maxResponseBytes, 'maxResponseBytes');

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
      throw new BoundedFetchError('NPM_REQUEST_TIMEOUT', 'npm Registry request timed out.');
    }
    throw new BoundedFetchError('NPM_TRANSPORT_FAILED', 'npm Registry request failed.');
  } finally {
    clearTimeout(timer);
  }

  if (!response || !Number.isInteger(response.status)) {
    throw new BoundedFetchError('NPM_RESPONSE_INVALID', 'npm Registry returned an invalid HTTP response.');
  }
  if (response.status !== 200) return { status: response.status, body: null };

  const contentType = headerValue(response.headers, 'content-type');
  if (!contentType || !JSON_MEDIA_TYPE.test(contentType)) {
    throw new BoundedFetchError('NPM_RESPONSE_INVALID', 'npm Registry response must use a JSON media type.');
  }

  const text = await readBoundedText(response, maxResponseBytes);
  try {
    return { status: 200, body: JSON.parse(text) };
  } catch {
    throw new BoundedFetchError('NPM_RESPONSE_INVALID', 'npm Registry response is not valid JSON.');
  }
}
