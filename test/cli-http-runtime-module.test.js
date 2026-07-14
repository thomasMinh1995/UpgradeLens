import assert from 'node:assert/strict';
import test from 'node:test';

import { CliHttpRuntimeError, createCliHttpRuntime } from '../src/http/cli-http-runtime.js';

test('CLI HTTP runtime scopes fetch to its owned dispatcher and closes idempotently', async () => {
  const globalFetch = globalThis.fetch;
  const state = { created: 0, closes: 0, dispatcher: null, init: null };
  const runtime = createCliHttpRuntime({
    createAgent(options) {
      state.created += 1;
      assert.equal(options.connections, 4);
      state.dispatcher = { async close() { state.closes += 1; } };
      return state.dispatcher;
    },
    async fetchImplementation(_url, init) {
      state.init = init;
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    }
  });
  await runtime.fetch('https://registry.example.test/package', { method: 'GET' });
  assert.equal(state.created, 1);
  assert.equal(state.init.dispatcher, state.dispatcher);
  assert.equal(globalThis.fetch, globalFetch);
  await runtime.close();
  await runtime.close();
  assert.equal(state.closes, 1);
  await assert.rejects(runtime.fetch('https://registry.example.test/package'), CliHttpRuntimeError);
});

test('runtime construction rejects an invalid dispatcher without global mutation', () => {
  const globalFetch = globalThis.fetch;
  assert.throws(() => createCliHttpRuntime({ createAgent: () => ({}) }), CliHttpRuntimeError);
  assert.equal(globalThis.fetch, globalFetch);
});
