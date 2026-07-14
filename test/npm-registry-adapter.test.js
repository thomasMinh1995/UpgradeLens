import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createKnowledgeCache } from '../src/knowledge-cache.js';
import { USER_AGENT } from '../src/constants.js';
import { createNpmRegistryAdapter } from '../src/registry/npm-registry-adapter.js';

const fixtureDirectory = new URL('./fixtures/npm/', import.meta.url);

async function fixture(name) {
  return JSON.parse(await fs.readFile(new URL(name, fixtureDirectory), 'utf8'));
}

function researchPackage(name = 'react', extra = {}) {
  return {
    id: `npm:${name}`,
    registry: 'npm',
    ecosystem: 'node',
    normalizedName: name,
    observedDeclaredNames: [name],
    occurrences: [{
      projectId: 'node:.',
      projectPath: '.',
      manifest: 'package.json',
      dependencyType: 'dependency',
      declaredName: name,
      declaredVersion: '^1.0.0'
    }],
    ...extra
  };
}

function responseJson(value, status = 200, contentType = 'application/json') {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': contentType } });
}

function fakeClock(initial = '2026-07-14T00:00:00.000Z') {
  let current = new Date(initial).getTime();
  return {
    clock: () => new Date(current),
    advance(milliseconds) { current += milliseconds; }
  };
}

async function withRoot(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upgradelens-npm-adapter-'));
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function adapter({ root, clock, fetch, ttlMs = 1_000, ...options }) {
  return createNpmRegistryAdapter({
    registryBaseUrl: 'https://registry.example.test',
    fetch,
    cache: createKnowledgeCache({ rootDirectory: root, clock }),
    clock,
    ttlMs,
    ...options
  });
}

test('constructs deterministic normal and scoped npm Registry requests without package-manager behavior', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const requests = [];
    const fetch = async (url, options) => {
      requests.push({ url, options });
      return responseJson(await fixture(url.includes('%40vitejs') ? 'scoped-packument.json' : 'react-packument.json'));
    };
    const registry = adapter({ root, clock: time.clock, fetch });
    assert.equal(registry.requestFor(researchPackage()), 'https://registry.example.test/react');
    assert.equal(
      registry.requestFor(researchPackage('@vitejs/plugin-react')),
      'https://registry.example.test/%40vitejs%2Fplugin-react'
    );
    const scoped = await registry.researchPackage(researchPackage('@vitejs/plugin-react'));
    assert.equal(scoped.package.identity.packageUrl, 'https://www.npmjs.com/package/@vitejs/plugin-react');
    assert.equal(scoped.package.identity.apiUrl, 'https://registry.example.test/%40vitejs%2Fplugin-react');
    assert.deepEqual(requests[0], {
      url: 'https://registry.example.test/%40vitejs%2Fplugin-react',
      options: {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: requests[0].options.signal,
        credentials: 'omit',
        redirect: 'error'
      }
    });
  });
});

test('fetches a missing packument, caches it, and normalizes only registry facts', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    let calls = 0;
    const registry = adapter({
      root,
      clock: time.clock,
      fetch: async () => { calls += 1; return responseJson(await fixture('react-packument.json')); }
    });
    const result = await registry.researchPackage(researchPackage());

    assert.equal(calls, 1);
    assert.equal(result.cache.outcome, 'miss');
    assert.equal(result.package.status, 'resolved');
    assert.equal(result.package.latest.version, '19.2.0');
    assert.equal(result.package.latest.selection, 'dist-tag:latest');
    assert.equal(result.package.latest.publishedAt, '2026-01-01T00:00:00.000Z');
    assert.equal(result.package.metadata.homepageUrl, 'https://react.dev');
    assert.equal(result.package.metadata.repositoryUrl, 'https://github.com/facebook/react');
    assert.equal(result.package.metadata.issueUrl, 'https://github.com/facebook/react/issues');
    assert.deepEqual(result.package.releaseIndex.map((release) => release.version), ['18.3.0', '19.2.0', '20.0.0']);
    assert.equal(result.package.releaseIndex[0].deprecated, true);
    assert.equal(result.package.releaseIndex[1].deprecated, false);
    assert.equal(result.package.releaseIndex[2].deprecated, null);
    assert.equal(result.package.releaseIndex[2].publishedAt, null);
    assert.equal(result.source.snapshot.freshness, 'fresh');
    assert.match(result.source.snapshot.contentDigest, /^sha256:[a-f0-9]{64}$/);
  });
});

test('a fresh cache hit performs no fetch and an expired entry is fetched and replaced', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      const body = await fixture('react-packument.json');
      body.description = `response-${calls}`;
      return responseJson(body);
    };
    const registry = adapter({ root, clock: time.clock, fetch, ttlMs: 10 });
    assert.equal((await registry.researchPackage(researchPackage())).package.metadata.description, 'response-1');
    assert.equal((await registry.researchPackage(researchPackage())).cache.outcome, 'hit');
    assert.equal(calls, 1);
    time.advance(10);
    const refreshed = await registry.researchPackage(researchPackage());
    assert.equal(calls, 2);
    assert.equal(refreshed.cache.outcome, 'revalidated');
    assert.equal(refreshed.package.metadata.description, 'response-2');

    time.advance(10);
    const failedRefresh = await adapter({
      root,
      clock: time.clock,
      ttlMs: 10,
      fetch: async () => { throw new DOMException('offline', 'AbortError'); }
    }).researchPackage(researchPackage());
    assert.equal(failedRefresh.package.status, 'unavailable');
    assert.equal(failedRefresh.cache.outcome, 'expired');
    assert.equal(failedRefresh.package.latest, null);
  });
});

test('a corrupted cache entry is replaced only after a valid registry response', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    let calls = 0;
    const fetch = async () => { calls += 1; return responseJson(await fixture('react-packument.json')); };
    const registry = adapter({ root, clock: time.clock, fetch });
    await registry.researchPackage(researchPackage());
    const [entry] = await fs.readdir(root);
    await fs.writeFile(path.join(root, entry), '{broken');

    const result = await registry.researchPackage(researchPackage());
    assert.equal(calls, 2);
    assert.equal(result.cache.outcome, 'corrupted-replaced');
    assert.equal(result.cache.reason, 'invalid-json');
    assert.equal((await registry.researchPackage(researchPackage())).cache.outcome, 'hit');
  });
});

test('maps npm HTTP and transport failures to sanitized package warnings', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const cases = [
      [async () => responseJson({ error: 'body must not leak' }, 404), 'notFound', 'PACKAGE_NOT_FOUND', false],
      [async () => responseJson({ error: 'body must not leak' }, 429), 'unavailable', 'REGISTRY_RATE_LIMITED', true],
      [async () => responseJson({ error: 'body must not leak' }, 503), 'unavailable', 'REGISTRY_UNAVAILABLE', true],
      [async () => { throw new DOMException('timeout detail must not leak', 'AbortError'); }, 'unavailable', 'REGISTRY_UNAVAILABLE', true]
    ];
    for (const [fetch, status, warningCode, retryable] of cases) {
      const caseRoot = await fs.mkdtemp(path.join(root, 'case-'));
      const result = await adapter({ root: caseRoot, clock: time.clock, fetch }).researchPackage(researchPackage());
      assert.equal(result.package.status, status);
      assert.equal(result.warnings[0].code, warningCode);
      assert.equal(result.warnings[0].retryable, retryable);
      assert.equal(JSON.stringify(result).includes('timeout detail must not leak'), false);
      await fs.rm(caseRoot, { recursive: true, force: true });
    }
  });
});

test('rejects invalid JSON, non-JSON media, oversized responses, and a mismatched package name without caching them', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const wrongName = await fixture('react-packument.json');
    wrongName.name = 'vue';
    const cases = [
      [async () => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } }), {}, 'NPM_RESPONSE_INVALID'],
      [async () => new Response('{}', { status: 200, headers: { 'content-type': 'text/plain' } }), {}, 'NPM_RESPONSE_INVALID'],
      [async () => new Response('x'.repeat(100), { status: 200, headers: { 'content-type': 'application/json' } }), { maxResponseBytes: 10 }, 'NPM_RESPONSE_TOO_LARGE'],
      [async () => responseJson(wrongName), {}, 'NPM_PACKUMENT_INVALID']
    ];
    for (const [fetch, options, errorCode] of cases) {
      const caseRoot = await fs.mkdtemp(path.join(root, 'case-'));
      const result = await adapter({ root: caseRoot, clock: time.clock, fetch, ...options }).researchPackage(researchPackage());
      assert.equal(result.package.status, 'unavailable');
      assert.equal(result.warnings[0].code, 'REGISTRY_RESPONSE_INVALID');
      assert.equal(result.errorCode, errorCode);
      assert.deepEqual(await fs.readdir(caseRoot), []);
      await fs.rm(caseRoot, { recursive: true, force: true });
    }
  });
});

test('does not choose another version when dist-tags.latest is missing or unknown', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    for (const latest of [undefined, '99.0.0']) {
      const body = await fixture('react-packument.json');
      if (latest === undefined) delete body['dist-tags'].latest;
      else body['dist-tags'].latest = latest;
      const result = await adapter({ root: await fs.mkdtemp(path.join(root, 'case-')), clock: time.clock, fetch: async () => responseJson(body) })
        .researchPackage(researchPackage());
      assert.equal(result.package.status, 'partial');
      assert.equal(result.package.latest, null);
      assert.equal(result.package.releaseIndex.length, 3);
    }
  });
});

test('normalizes string/object repositories and rejects credentialed repository URLs before cache persistence', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const bodies = [];
    const stringRepository = await fixture('react-packument.json');
    stringRepository.repository = 'git+https://github.com/example/string-repository.git';
    const credentialedRepository = await fixture('react-packument.json');
    credentialedRepository.repository = { type: 'git', url: 'git+https://secret@example.com/private/repository.git' };
    bodies.push(stringRepository, credentialedRepository);
    for (const [index, body] of bodies.entries()) {
      const caseRoot = await fs.mkdtemp(path.join(root, 'case-'));
      const result = await adapter({ root: caseRoot, clock: time.clock, fetch: async () => responseJson(body) })
        .researchPackage(researchPackage());
      assert.equal(result.package.metadata.repositoryUrl, index === 0
        ? 'https://github.com/example/string-repository'
        : null);
      const [entry] = await fs.readdir(caseRoot);
      assert.equal((await fs.readFile(path.join(caseRoot, entry), 'utf8')).includes('secret@example.com'), false);
      await fs.rm(caseRoot, { recursive: true, force: true });
    }
  });
});

test('normalization is independent of payload object completion order and source package manager origin', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const original = await fixture('react-packument.json');
    const reordered = Object.fromEntries(Object.entries(original).reverse());
    const managers = ['npm', 'Yarn', 'pnpm', 'Bun'];
    const requests = [];
    const results = [];
    for (const [index, packageManager] of managers.entries()) {
      const caseRoot = await fs.mkdtemp(path.join(root, `manager-${index}-`));
      const fetch = async (url) => {
        requests.push(url);
        return responseJson(index % 2 === 0 ? original : reordered);
      };
      const registry = adapter({ root: caseRoot, clock: time.clock, fetch });
      const input = researchPackage('react', { packageManager });
      results.push(await registry.researchPackage(input));
      assert.deepEqual(registry.cacheIdentityFor(input), registry.cacheIdentityFor(researchPackage()));
      await fs.rm(caseRoot, { recursive: true, force: true });
    }
    assert.deepEqual(requests, Array(4).fill('https://registry.example.test/react'));
    assert.deepEqual(results.map((result) => result.package), Array(4).fill(results[0].package));
    assert.deepEqual(results.map((result) => result.source), Array(4).fill(results[0].source));
  });
});
