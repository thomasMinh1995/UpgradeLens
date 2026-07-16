import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCli } from '../src/cli.js';

const npmFixtures = new URL('./fixtures/npm/', import.meta.url);

function capture() {
  let value = '';
  return { stream: { write(chunk) { value += chunk; } }, value: () => value };
}

async function repository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upgradelens-cli-runtime-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'cli-runtime-fixture', version: '1.0.0', dependencies: { react: '^19.0.0' }
  }));
  return root;
}

async function response() {
  return new Response(await fs.readFile(new URL('react-packument.json', npmFixtures), 'utf8'), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
}

function trackedRuntime({ closeError = null } = {}) {
  const state = { fetches: 0, closes: 0 };
  return {
    state,
    runtime: {
      async fetch() { state.fetches += 1; return response(); },
      async close() {
        state.closes += 1;
        if (closeError) throw closeError;
      }
    }
  };
}

test('online research creates and closes a CLI-owned runtime exactly once, including stdout output', async (t) => {
  const root = await repository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.equal(await runCli(['discover', root], { stdout: capture().stream, stderr: capture().stream }), 0);
  const tracked = trackedRuntime();
  let created = 0;
  const stdout = capture();
  const stderr = capture();
  assert.equal(await runCli(['research', root, '--stdout'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    evidenceSourceAdapter: null,
    createHttpRuntime() { created += 1; return tracked.runtime; }
  }), 0);
  assert.equal(created, 1);
  assert.equal(tracked.state.fetches, 1);
  assert.equal(tracked.state.closes, 1);
  assert.equal(JSON.parse(stdout.value()).schemaVersion, '1.0.0');
  assert.equal(stderr.value(), '');
});

test('CLI closes its runtime after input, manifest, and writer failures without masking the primary error', async (t) => {
  const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'upgradelens-cli-runtime-missing-'));
  t.after(() => fs.rm(missingRoot, { recursive: true, force: true }));
  const inputRuntime = trackedRuntime({ closeError: new Error('close secret') });
  const inputError = capture();
  assert.equal(await runCli(['research', missingRoot], {
    stdout: capture().stream, stderr: inputError.stream, createHttpRuntime: () => inputRuntime.runtime
  }), 1);
  assert.equal(inputRuntime.state.closes, 1);
  assert.match(inputError.value(), /ENOENT/);
  assert.equal(inputError.value().includes('close secret'), false);

  const root = await repository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await runCli(['discover', root], { stdout: capture().stream, stderr: capture().stream });
  for (const [name, ioOverrides] of [
    ['manifest', { buildKnowledgeManifest() { throw new Error('manifest primary failure'); } }],
    ['writer', { async writeKnowledgeManifest() { throw new Error('writer primary failure'); } }]
  ]) {
    const runtime = trackedRuntime();
    const stderr = capture();
    assert.equal(await runCli(['research', root], {
      stdout: capture().stream,
      stderr: stderr.stream,
      createHttpRuntime: () => runtime.runtime,
      ...ioOverrides
    }), 1, name);
    assert.equal(runtime.state.closes, 1, name);
    assert.match(stderr.value(), new RegExp(`${name} primary failure`));
  }
});

test('a close failure is operational only after successful research and injected fetches remain user-owned', async (t) => {
  const root = await repository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await runCli(['discover', root], { stdout: capture().stream, stderr: capture().stream });
  const runtime = trackedRuntime({ closeError: new Error('raw close secret') });
  const stderr = capture();
  assert.equal(await runCli(['research', root], {
    stdout: capture().stream, stderr: stderr.stream, createHttpRuntime: () => runtime.runtime
  }), 1);
  assert.equal(runtime.state.closes, 1);
  assert.match(stderr.value(), /Unable to close the CLI HTTP runtime/);
  assert.equal(stderr.value().includes('raw close secret'), false);

  let fetchClosed = 0;
  const injectedFetch = async () => response();
  injectedFetch.close = async () => { fetchClosed += 1; };
  assert.equal(await runCli(['research', root], {
    stdout: capture().stream, stderr: capture().stream, fetch: injectedFetch,
    createHttpRuntime() { throw new Error('runtime must not be created'); }
  }), 0);
  assert.equal(fetchClosed, 0);
});

test('offline research, discovery, help, and version do not create a CLI HTTP runtime', async (t) => {
  const root = await repository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let created = 0;
  const createHttpRuntime = () => { created += 1; throw new Error('network runtime must not be created'); };
  assert.equal(await runCli(['discover', root], { stdout: capture().stream, stderr: capture().stream, createHttpRuntime }), 0);
  assert.equal(await runCli(['research', root, '--offline'], {
    stdout: capture().stream, stderr: capture().stream, createHttpRuntime
  }), 0);
  assert.equal(await runCli(['--help'], { stdout: capture().stream, stderr: capture().stream, createHttpRuntime }), 0);
  assert.equal(await runCli(['--version'], { stdout: capture().stream, stderr: capture().stream, createHttpRuntime }), 0);
  assert.equal(created, 0);
});
