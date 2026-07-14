import assert from 'node:assert/strict';
import test from 'node:test';

import { BoundedFetchError, fetchRegistryJson } from '../src/http/bounded-fetch.js';

function trackedResponse({ status = 200, contentType = 'application/json', chunks = [], cancelError = null }) {
  const state = { bodyCancelled: 0, readerCancelled: 0, released: 0 };
  let index = 0;
  const reader = {
    async read() {
      if (index >= chunks.length) return { done: true };
      return { done: false, value: chunks[index++] };
    },
    async cancel() {
      state.readerCancelled += 1;
      if (cancelError) throw cancelError;
    },
    releaseLock() { state.released += 1; }
  };
  const body = {
    getReader() { return reader; },
    async cancel() { state.bodyCancelled += 1; }
  };
  return {
    response: { status, headers: new Headers({ 'content-type': contentType }), body },
    state
  };
}

function fakeTimers() {
  const state = { created: [], cleared: [] };
  return {
    state,
    setTimeout(callback, delay) {
      const handle = { callback, delay };
      state.created.push(handle);
      return handle;
    },
    clearTimeout(handle) { state.cleared.push(handle); }
  };
}

test('bounded reader cancels and unlocks an oversized stream while clearing its timeout', async () => {
  const tracked = trackedResponse({ chunks: [Buffer.from('{"value":"'), Buffer.alloc(64, 120)] });
  const timers = fakeTimers();
  await assert.rejects(
    fetchRegistryJson('https://registry.example.test/package', {
      fetchImplementation: async () => tracked.response,
      maxResponseBytes: 20,
      errorPrefix: 'TEST',
      serviceName: 'test Registry',
      setTimeoutImplementation: timers.setTimeout,
      clearTimeoutImplementation: timers.clearTimeout
    }),
    (error) => error instanceof BoundedFetchError && error.code === 'TEST_RESPONSE_TOO_LARGE'
  );
  assert.equal(tracked.state.readerCancelled, 1);
  assert.equal(tracked.state.released, 1);
  assert.equal(tracked.state.bodyCancelled, 1);
  assert.equal(timers.state.cleared.length, 1);
});

test('unused non-200 and invalid-media response bodies are explicitly cancelled', async () => {
  for (const status of [404, 429, 503]) {
    const tracked = trackedResponse({ status, chunks: [Buffer.from('{"ignored":true}')] });
    const result = await fetchRegistryJson('https://registry.example.test/package', {
      fetchImplementation: async () => tracked.response,
      maxResponseBytes: 100,
      errorPrefix: 'TEST',
      serviceName: 'test Registry'
    });
    assert.equal(result.status, status);
    assert.equal(tracked.state.bodyCancelled, 1);
  }

  const invalidMedia = trackedResponse({ contentType: 'text/plain', chunks: [Buffer.from('not-json')] });
  await assert.rejects(
    fetchRegistryJson('https://registry.example.test/package', {
      fetchImplementation: async () => invalidMedia.response,
      maxResponseBytes: 100,
      errorPrefix: 'TEST',
      serviceName: 'test Registry'
    }),
    (error) => error.code === 'TEST_RESPONSE_INVALID'
  );
  assert.equal(invalidMedia.state.bodyCancelled, 1);
});

test('fallback test-double body readers remain bounded and cleanup errors stay sanitized', async () => {
  let cancelled = 0;
  const response = {
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    body: { async cancel() { cancelled += 1; throw new Error('raw cleanup secret'); } },
    async text() { return '{"padding":"xxxxxxxxxxxxxxxxxxxxxxxx"}'; }
  };
  await assert.rejects(
    fetchRegistryJson('https://registry.example.test/package', {
      fetchImplementation: async () => response,
      maxResponseBytes: 10,
      errorPrefix: 'TEST',
      serviceName: 'test Registry'
    }),
    (error) => error.code === 'TEST_RESPONSE_TOO_LARGE' && !error.message.includes('raw cleanup secret')
  );
  assert.equal(cancelled, 1);
});

test('timeouts and failed body reads clear their timeout handles without leaking raw errors', async () => {
  const timers = fakeTimers();
  await assert.rejects(
    fetchRegistryJson('https://registry.example.test/package', {
      fetchImplementation: async (_url, options) => {
        timers.state.created[0].callback();
        assert.equal(options.signal.aborted, true);
        throw new DOMException('upstream secret', 'AbortError');
      },
      maxResponseBytes: 100,
      errorPrefix: 'TEST',
      serviceName: 'test Registry',
      setTimeoutImplementation: timers.setTimeout,
      clearTimeoutImplementation: timers.clearTimeout
    }),
    (error) => error.code === 'TEST_REQUEST_TIMEOUT' && !error.message.includes('upstream secret')
  );
  assert.equal(timers.state.cleared.length, 1);

  const readFailure = trackedResponse({ chunks: [] });
  readFailure.response.body.getReader = () => ({
    async read() { throw new Error('raw body secret'); },
    async cancel() {},
    releaseLock() {}
  });
  await assert.rejects(
    fetchRegistryJson('https://registry.example.test/package', {
      fetchImplementation: async () => readFailure.response,
      maxResponseBytes: 100,
      errorPrefix: 'TEST',
      serviceName: 'test Registry'
    }),
    (error) => error.code === 'TEST_TRANSPORT_FAILED' && !error.message.includes('raw body secret')
  );
});
