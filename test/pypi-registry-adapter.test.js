import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createKnowledgeCache } from '../src/knowledge-cache.js';
import { createPypiRegistryAdapter } from '../src/registry/pypi-registry-adapter.js';

const fixtureDirectory = new URL('./fixtures/pypi/', import.meta.url);

async function fixture() {
  return JSON.parse(await fs.readFile(new URL('fastapi-project.json', fixtureDirectory), 'utf8'));
}

function researchPackage(name = 'fastapi', extra = {}) {
  return {
    id: `pypi:${name}`,
    registry: 'pypi',
    ecosystem: 'python',
    normalizedName: name,
    observedDeclaredNames: [name],
    occurrences: [{
      projectId: 'python:.',
      projectPath: '.',
      manifest: 'requirements.txt',
      dependencyType: 'runtime',
      declaredName: name,
      declaredVersion: '>=1.0'
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upgradelens-pypi-adapter-'));
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function adapter({ root, clock, fetch, ttlMs = 1_000, ...options }) {
  return createPypiRegistryAdapter({
    registryBaseUrl: 'https://pypi.example.test',
    indexBaseUrl: 'https://pypi.example.test/simple',
    fetch,
    cache: createKnowledgeCache({ rootDirectory: root, clock }),
    clock,
    ttlMs,
    ...options
  });
}

test('normalizes Python names into one PyPI request and cache identity', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const registry = adapter({ root, clock: time.clock, fetch: async () => responseJson(await fixture()) });
    const forms = ['FastAPI', 'fastapi', 'FASTAPI'];
    const inputs = forms.map((form) => researchPackage('fastapi', {
      normalizedName: form,
      observedDeclaredNames: [form]
    }));
    assert.deepEqual(inputs.map((input) => registry.requestFor(input)), Array(3).fill('https://pypi.example.test/pypi/fastapi/json'));
    assert.deepEqual(inputs.map((input) => registry.cacheIdentityFor(input)), Array(3).fill(registry.cacheIdentityFor(inputs[0])));

    const dotted = researchPackage('zope-interface', { normalizedName: 'zope.interface' });
    const underscored = researchPackage('zope-interface', { normalizedName: 'zope_interface' });
    const hyphenated = researchPackage('zope-interface', { normalizedName: 'zope-interface' });
    assert.equal(registry.requestFor(dotted), 'https://pypi.example.test/pypi/zope-interface/json');
    assert.deepEqual(registry.cacheIdentityFor(dotted), registry.cacheIdentityFor(underscored));
    assert.deepEqual(registry.cacheIdentityFor(dotted), registry.cacheIdentityFor(hyphenated));
  });
});

test('fetches and caches project JSON while normalizing latest, releases, metadata, and provenance', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    let calls = 0;
    const registry = adapter({
      root,
      clock: time.clock,
      fetch: async () => { calls += 1; return responseJson(await fixture()); }
    });
    const result = await registry.researchPackage(researchPackage());

    assert.equal(calls, 1);
    assert.equal(result.cache.outcome, 'miss');
    assert.equal(result.package.status, 'resolved');
    assert.equal(result.package.latest.version, '0.115.0');
    assert.equal(result.package.latest.selection, 'project-info-version');
    assert.equal(result.package.latest.publishedAt, '2026-02-01T00:00:00.000Z');
    assert.equal(result.package.latest.yanked, false);
    assert.deepEqual(result.package.releaseIndex.map((item) => item.version), ['0.100.0', '0.115.0', '0.120.0', '0.99.0']);
    assert.equal(result.package.releaseIndex[0].yanked, true);
    assert.equal(result.package.releaseIndex[2].publishedAt, null);
    assert.equal(result.package.releaseIndex[2].yanked, null);
    assert.equal(result.package.metadata.documentationUrl, 'https://fastapi.tiangolo.com');
    assert.equal(result.package.metadata.repositoryUrl, 'https://github.com/fastapi/fastapi');
    assert.equal(result.package.metadata.issueUrl, 'https://github.com/fastapi/fastapi/issues');
    assert.equal(result.package.metadata.homepageUrl, 'https://fallback.example.invalid');
    assert.equal(result.package.metadata.license, 'MIT');
    assert.equal(result.package.metadata.projectStatus, 'Development Status :: 5 - Production/Stable');
    assert.equal(result.source.id, 'pypi:fastapi:registry');
    assert.match(result.source.snapshot.contentDigest, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(result.sourceCandidates, [{
      role: 'changelog',
      url: 'https://fastapi.tiangolo.com/release-notes/',
      discoveredFromField: 'info.project_urls.Changelog'
    }]);
  });
});

test('uses a fresh cache without fetching and replaces expired or corrupted entries only after valid responses', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      const body = await fixture();
      body.info.summary = `response-${calls}`;
      return responseJson(body);
    };
    const registry = adapter({ root, clock: time.clock, fetch, ttlMs: 10 });
    assert.equal((await registry.researchPackage(researchPackage())).package.metadata.description, 'response-1');
    assert.equal((await registry.researchPackage(researchPackage())).cache.outcome, 'hit');
    assert.equal(calls, 1);
    time.advance(10);
    assert.equal((await registry.researchPackage(researchPackage())).cache.outcome, 'revalidated');
    assert.equal(calls, 2);

    const [entry] = await fs.readdir(root);
    await fs.writeFile(path.join(root, entry), '{broken');
    const replacement = await registry.researchPackage(researchPackage());
    assert.equal(replacement.cache.outcome, 'corrupted-replaced');
    assert.equal(replacement.cache.reason, 'invalid-json');
    assert.equal(calls, 3);

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

test('maps PyPI HTTP and transport failures to sanitized warnings', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const cases = [
      [async () => responseJson({ detail: 'not exposed' }, 404), 'notFound', 'PACKAGE_NOT_FOUND', false],
      [async () => responseJson({ detail: 'not exposed' }, 429), 'unavailable', 'REGISTRY_RATE_LIMITED', true],
      [async () => responseJson({ detail: 'not exposed' }, 503), 'unavailable', 'REGISTRY_UNAVAILABLE', true],
      [async () => { throw new DOMException('credential=secret', 'AbortError'); }, 'unavailable', 'REGISTRY_UNAVAILABLE', true]
    ];
    for (const [fetch, status, warningCode, retryable] of cases) {
      const caseRoot = await fs.mkdtemp(path.join(root, 'case-'));
      const result = await adapter({ root: caseRoot, clock: time.clock, fetch }).researchPackage(researchPackage());
      assert.equal(result.package.status, status);
      assert.equal(result.warnings[0].code, warningCode);
      assert.equal(result.warnings[0].retryable, retryable);
      assert.equal(JSON.stringify(result).includes('credential=secret'), false);
      await fs.rm(caseRoot, { recursive: true, force: true });
    }
  });
});

test('rejects invalid JSON, media, size, and mismatched project names without caching them', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const mismatch = await fixture();
    mismatch.info.name = 'Different_Project';
    const cases = [
      [async () => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } }), {}, 'PYPI_RESPONSE_INVALID'],
      [async () => new Response('{}', { status: 200, headers: { 'content-type': 'text/plain' } }), {}, 'PYPI_RESPONSE_INVALID'],
      [async () => new Response('x'.repeat(100), { status: 200, headers: { 'content-type': 'application/json' } }), { maxResponseBytes: 10 }, 'PYPI_RESPONSE_TOO_LARGE'],
      [async () => responseJson(mismatch), {}, 'PYPI_PROJECT_INVALID']
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

test('never substitutes another release when info.version is missing and represents yanked facts explicitly', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const variants = [
      ['missing', (body) => { delete body.info.version; }, null, 'partial'],
      ['all-yanked', (body) => { body.releases['0.115.0'].forEach((file) => { file.yanked = true; }); }, true, 'resolved'],
      ['unknown-yanked', (body) => { body.releases['0.115.0'].forEach((file) => { delete file.yanked; }); }, null, 'resolved']
    ];
    for (const [name, mutate, yanked, status] of variants) {
      const body = await fixture();
      mutate(body);
      const caseRoot = await fs.mkdtemp(path.join(root, `${name}-`));
      const result = await adapter({ root: caseRoot, clock: time.clock, fetch: async () => responseJson(body) })
        .researchPackage(researchPackage());
      assert.equal(result.package.status, status);
      assert.equal(result.package.latest?.yanked ?? null, yanked);
      if (name === 'missing') {
        assert.equal(result.package.latest, null);
        assert.equal(result.package.releaseIndex.length, 4);
      }
      await fs.rm(caseRoot, { recursive: true, force: true });
    }
  });
});

test('normalizes project URLs safely, ignores unsupported labels, and tolerates missing optional metadata', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const body = await fixture();
    body.info.project_urls.Documentation = 'https://token@example.com/private';
    body.info.project_urls.Source = 'git+https://github.com/example/project.git';
    body.info.project_urls.Issues = 'http://insecure.example.test/issues';
    body.info.project_urls['Release Notes'] = 'https://example.test/releases';
    body.info.home_page = 'https://home.example.test/?signed=token';
    body.info.license_expression = '';
    body.info.license = 'Apache-2.0';
    delete body.info.summary;
    delete body.info.description;
    delete body.info.classifiers;
    const result = await adapter({ root, clock: time.clock, fetch: async () => responseJson(body) })
      .researchPackage(researchPackage());
    assert.equal(result.package.metadata.documentationUrl, null);
    assert.equal(result.package.metadata.repositoryUrl, 'https://github.com/example/project');
    assert.equal(result.package.metadata.issueUrl, null);
    assert.equal(result.package.metadata.homepageUrl, 'https://home.example.test');
    assert.equal(result.package.metadata.license, 'Apache-2.0');
    assert.equal(result.package.metadata.description, null);
    assert.equal(result.package.metadata.projectStatus, null);
    const [entry] = await fs.readdir(root);
    const cached = await fs.readFile(path.join(root, entry), 'utf8');
    assert.equal(cached.includes('token@example.com'), false);
    assert.equal(cached.includes('signed=token'), false);
    assert.equal(JSON.stringify(result).includes('Unknown Label'), false);
    assert.equal('changelogUrl' in result.package.metadata, false);
  });
});

test('pip, pip-tools, Poetry, uv, and Pipenv origins remain installer-independent and deterministic', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const installers = ['pip', 'pip-tools', 'Poetry', 'uv', 'Pipenv'];
    const requests = [];
    const results = [];
    for (const [index, installer] of installers.entries()) {
      const caseRoot = await fs.mkdtemp(path.join(root, `installer-${index}-`));
      const fetch = async (url) => {
        requests.push(url);
        return responseJson(await fixture());
      };
      const registry = adapter({ root: caseRoot, clock: time.clock, fetch });
      const input = researchPackage('fastapi', { installer });
      results.push(await registry.researchPackage(input));
      assert.deepEqual(registry.cacheIdentityFor(input), registry.cacheIdentityFor(researchPackage()));
      await fs.rm(caseRoot, { recursive: true, force: true });
    }
    assert.deepEqual(requests, Array(5).fill('https://pypi.example.test/pypi/fastapi/json'));
    assert.deepEqual(results.map((result) => result.package), Array(5).fill(results[0].package));
    assert.deepEqual(results.map((result) => result.source), Array(5).fill(results[0].source));
  });
});
