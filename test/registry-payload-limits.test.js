import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { MAX_REGISTRY_RESPONSE_BYTES } from '../src/http/bounded-fetch.js';
import { createKnowledgeCache } from '../src/knowledge-cache.js';
import {
  createNpmRegistryAdapter,
  DEFAULT_NPM_MAX_RESPONSE_BYTES
} from '../src/registry/npm-registry-adapter.js';
import {
  createPypiRegistryAdapter,
  DEFAULT_PYPI_MAX_RESPONSE_BYTES
} from '../src/registry/pypi-registry-adapter.js';

const npmFixtures = new URL('./fixtures/npm/', import.meta.url);
const pypiFixtures = new URL('./fixtures/pypi/', import.meta.url);

function npmPackage() {
  return {
    id: 'npm:react', registry: 'npm', ecosystem: 'node', normalizedName: 'react', observedDeclaredNames: ['react'],
    occurrences: [{ projectId: 'node:.', projectPath: '.', manifest: 'package.json', dependencyType: 'dependency', declaredName: 'react', declaredVersion: '^19.0.0' }]
  };
}

function pypiPackage() {
  return {
    id: 'pypi:fastapi', registry: 'pypi', ecosystem: 'python', normalizedName: 'fastapi', observedDeclaredNames: ['fastapi'],
    occurrences: [{ projectId: 'python:.', projectPath: '.', manifest: 'requirements.txt', dependencyType: 'runtime', declaredName: 'fastapi', declaredVersion: '>=1.0' }]
  };
}

function padded(value, size) {
  value._testPadding = [];
  let remaining = Math.max(0, size - Buffer.byteLength(JSON.stringify(value)));
  while (remaining > 0) {
    const chunk = '!'.repeat(Math.min(8_192, remaining));
    value._testPadding.push(chunk);
    remaining -= Buffer.byteLength(JSON.stringify(chunk)) + 1;
  }
  return value;
}

function response(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

function declaredOversizedResponse(size) {
  return new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-length': String(size) }
  });
}

async function fixture(directory, name) {
  return JSON.parse(await fs.readFile(new URL(name, directory), 'utf8'));
}

async function withRoot(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upgradelens-registry-limits-'));
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function npmAdapter(root, fetch, options = {}) {
  return createNpmRegistryAdapter({
    registryBaseUrl: 'https://registry.example.test', fetch,
    cache: createKnowledgeCache({ rootDirectory: root }), ...options
  });
}

function pypiAdapter(root, fetch, options = {}) {
  return createPypiRegistryAdapter({
    registryBaseUrl: 'https://pypi.example.test', indexBaseUrl: 'https://pypi.example.test/simple', fetch,
    cache: createKnowledgeCache({ rootDirectory: root }), ...options
  });
}

test('npm accepts a >1 MiB and near-6.8 MiB packument, then reuses the cached large body', async () => {
  await withRoot(async (root) => {
    const large = padded(await fixture(npmFixtures, 'react-packument.json'), Math.floor(6.8 * 1024 * 1024));
    let calls = 0;
    const registry = npmAdapter(root, async () => { calls += 1; return response(large); });
    assert.equal((await registry.researchPackage(npmPackage())).package.status, 'resolved');
    assert.equal((await registry.researchPackage(npmPackage())).cache.outcome, 'hit');
    assert.equal(calls, 1);
  });
});

test('PyPI accepts a >1 MiB and near-1.8 MiB project response, then reuses the cached large body', async () => {
  await withRoot(async (root) => {
    const large = padded(await fixture(pypiFixtures, 'fastapi-project.json'), Math.floor(1.8 * 1024 * 1024));
    let calls = 0;
    const registry = pypiAdapter(root, async () => { calls += 1; return response(large); });
    assert.equal((await registry.researchPackage(pypiPackage())).package.status, 'resolved');
    assert.equal((await registry.researchPackage(pypiPackage())).cache.outcome, 'hit');
    assert.equal(calls, 1);
  });
});

test('adapter limits remain bounded, respect explicit overrides, and reject invalid configuration', async () => {
  await withRoot(async (root) => {
    const npmResult = await npmAdapter(root, async () => declaredOversizedResponse(DEFAULT_NPM_MAX_RESPONSE_BYTES + 1)).researchPackage(npmPackage());
    assert.equal(npmResult.errorCode, 'NPM_RESPONSE_TOO_LARGE');
    assert.deepEqual(await fs.readdir(root), []);

    const pypiRoot = await fs.mkdtemp(path.join(root, 'pypi-'));
    const pypiResult = await pypiAdapter(pypiRoot, async () => declaredOversizedResponse(DEFAULT_PYPI_MAX_RESPONSE_BYTES + 1)).researchPackage(pypiPackage());
    assert.equal(pypiResult.errorCode, 'PYPI_RESPONSE_TOO_LARGE');
    assert.deepEqual(await fs.readdir(pypiRoot), []);

    const small = padded(await fixture(npmFixtures, 'react-packument.json'), 2_048);
    const overridden = await npmAdapter(await fs.mkdtemp(path.join(root, 'override-')), async () => response(small), { maxResponseBytes: 1_024 })
      .researchPackage(npmPackage());
    assert.equal(overridden.errorCode, 'NPM_RESPONSE_TOO_LARGE');
  });

  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER, MAX_REGISTRY_RESPONSE_BYTES + 1]) {
    assert.throws(() => createNpmRegistryAdapter({ maxResponseBytes: value }), /maxResponseBytes/);
    assert.throws(() => createPypiRegistryAdapter({ maxResponseBytes: value }), /maxResponseBytes/);
  }
});
