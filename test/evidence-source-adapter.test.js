import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyEvidenceContent,
  createEvidenceSourceAdapter,
  discoverEvidenceSourceRequests,
  normalizeEvidenceContent
} from '../src/evidence-source-adapter.js';
import { fetchEvidenceDocument } from '../src/http/bounded-fetch.js';

const NOW = '2026-07-15T00:00:00.000Z';

function memoryCache(initial = new Map()) {
  const entries = initial;
  return {
    entries,
    async read(identity) {
      return entries.get(JSON.stringify(identity)) ?? { status: 'missing' };
    },
    async write(identity, body) {
      entries.set(JSON.stringify(identity), {
        status: 'fresh', body, storedAt: NOW, expiresAt: '2026-07-16T00:00:00.000Z'
      });
      return { status: 'written', storedAt: NOW, expiresAt: '2026-07-16T00:00:00.000Z' };
    }
  };
}

function packageRecord({ ecosystem = 'node', sourceIds } = {}) {
  return {
    id: ecosystem === 'node' ? 'npm:example' : 'pypi:example',
    ecosystem,
    sourceIds: sourceIds ?? [
      ecosystem === 'node' ? 'npm:example:registry' : 'pypi:example:registry',
      ecosystem === 'node' ? 'npm:example:repository' : 'pypi:example:repository'
    ],
    releaseIndex: ['1.0.0', '1.5.0', '2.0.0', '2.1.0'].map((version) => ({ version }))
  };
}

function registrySource(packageId = 'npm:example') {
  return {
    id: `${packageId}:registry`, kind: 'registry', authority: 'registryAuthoritative', trust: 'publisher',
    url: `https://registry.example.test/${packageId}`, status: 'available', supports: ['metadata'],
    discoveredFrom: null, trustEvidenceSourceIds: [], snapshot: null, conflictsWith: []
  };
}

function repositorySource(packageId = 'npm:example', url = 'https://github.com/example/project') {
  return {
    id: `${packageId}:repository`, kind: 'sourceRepository', authority: 'publisherProvided', trust: 'publisher',
    url, status: 'unverified', supports: ['repository'], discoveredFrom: `${packageId}:registry`,
    trustEvidenceSourceIds: [`${packageId}:registry`], snapshot: null, conflictsWith: []
  };
}

function directSource(packageId, role, url) {
  return {
    id: `${packageId}:${role}`, kind: role === 'releases' ? 'releaseFeed' : 'officialDocumentation',
    authority: 'publisherProvided', trust: 'publisher', url, status: 'unverified', supports: [role],
    discoveredFrom: `${packageId}:registry`, trustEvidenceSourceIds: [`${packageId}:registry`],
    snapshot: null, conflictsWith: []
  };
}

function response(body, contentType = 'text/markdown', status = 200) {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

test('discovers bounded official GitHub release, changelog, and migration candidates', () => {
  const pkg = packageRecord();
  const requests = discoverEvidenceSourceRequests(pkg, [registrySource(), repositorySource()]);
  assert.deepEqual(requests.map((item) => item.role), ['releases', 'changelog', 'migrationGuide']);
  assert.ok(requests.every((item) => item.discoveredFrom === 'npm:example:repository'));
  assert.equal(discoverEvidenceSourceRequests(pkg, [registrySource(), repositorySource()], { maxCandidates: 2 }).length, 2);
});

test('uses direct PyPI changelog, release, and migration links without ecosystem-specific core logic', () => {
  const packageId = 'pypi:example';
  const pkg = packageRecord({ ecosystem: 'python', sourceIds: [
    `${packageId}:registry`, `${packageId}:changelog`, `${packageId}:releaseNotes`, `${packageId}:migrationGuide`
  ] });
  const sources = [
    registrySource(packageId),
    directSource(packageId, 'changelog', 'https://docs.example.test/changelog'),
    directSource(packageId, 'releaseNotes', 'https://docs.example.test/releases'),
    directSource(packageId, 'migrationGuide', 'https://docs.example.test/migration')
  ];
  assert.deepEqual(
    discoverEvidenceSourceRequests(pkg, sources).map((item) => item.role),
    ['releaseNotes', 'changelog', 'migrationGuide']
  );
});

test('does not invent candidates for packages without qualified official links or generic repositories', () => {
  const pkg = packageRecord({ sourceIds: ['npm:example:registry', 'npm:example:repository'] });
  assert.deepEqual(discoverEvidenceSourceRequests(pkg, [
    registrySource(), repositorySource('npm:example', 'https://git.example.test/example/project')
  ]), []);
  const unsafe = directSource('npm:example', 'changelog', 'http://localhost/changelog');
  assert.deepEqual(discoverEvidenceSourceRequests(
    packageRecord({ sourceIds: ['npm:example:registry', unsafe.id] }),
    [registrySource(), unsafe]
  ), []);
});

test('classifies explicit source roles and headings without promoting ambiguous documentation', () => {
  assert.equal(classifyEvidenceContent({ role: 'releases', heading: 'Version 2.0.0' }), 'releaseNotes');
  assert.equal(classifyEvidenceContent({ role: 'changelog', heading: 'Breaking Changes' }), 'breakingChanges');
  assert.equal(classifyEvidenceContent({ role: 'changelog', heading: 'Deprecated APIs' }), 'deprecations');
  assert.equal(classifyEvidenceContent({ role: 'releaseNotes', heading: 'Python compatibility' }), 'compatibility');
  assert.equal(classifyEvidenceContent({ role: 'migrationGuide', heading: 'Upgrade to 2.0' }), 'migrationGuide');
  assert.equal(classifyEvidenceContent({ role: 'documentation', heading: 'Getting started' }), null);
});

test('normalizes HTML, Markdown, Unicode, whitespace, and content limits deterministically', () => {
  const html = '<nav>menu</nav><h2>Breaking Changes</h2><p>Xin cha\u0300o &amp; API</p><footer>footer</footer>';
  const normalized = normalizeEvidenceContent(html, { mediaType: 'text/html' });
  assert.equal(normalized, '## Breaking Changes\nXin chào & API');
  assert.equal(normalizeEvidenceContent('## Title\r\n\r\n`api()`  \r\n'), '## Title\n\n`api()`');
  const bounded = normalizeEvidenceContent('word '.repeat(100), { maxCharacters: 40 });
  assert.match(bounded, /\[content truncated\]$/);
  assert.equal(bounded, normalizeEvidenceContent('word '.repeat(100), { maxCharacters: 40 }));
});

test('release API objects become version-scoped evidence and preserve provenance', async () => {
  const pkg = packageRecord();
  const sources = [registrySource(), repositorySource()];
  let calls = 0;
  const adapter = createEvidenceSourceAdapter({
    cache: memoryCache(),
    fetch: async (url) => {
      calls += 1;
      if (String(url).endsWith('/releases')) return response(JSON.stringify([
        { tag_name: 'v2.0.0', name: '2.0.0 Breaking Changes', body: 'Removed legacy API.', draft: false, published_at: NOW },
        { tag_name: 'v0.9.0', name: 'old', body: 'Outside known index.', draft: false }
      ]), 'application/json');
      return response('', 'text/plain', 404);
    }
  });
  const enriched = await adapter.enrich({ packages: [pkg], sources });
  assert.equal(calls, 3);
  assert.equal(enriched.evidence.length, 1);
  assert.equal(enriched.evidence[0].kind, 'breakingChanges');
  assert.deepEqual(enriched.evidence[0].releaseVersions, ['2.0.0']);
  assert.match(enriched.evidence[0].content, /Removed legacy API/);
  const source = enriched.sources.find((item) => item.id === enriched.evidence[0].sourceId);
  assert.equal(source.status, 'available');
  assert.equal(source.discoveredFrom, 'npm:example:repository');
  assert.equal(source.snapshot.freshness, 'fresh');
});

test('changelog sections are classified once, version scoped, ordered, and content-deduplicated', async () => {
  const packageId = 'pypi:example';
  const pkg = packageRecord({ ecosystem: 'python', sourceIds: [
    `${packageId}:registry`, `${packageId}:changelog`, `${packageId}:releaseNotes`
  ] });
  const same = '# 2.0.0 Breaking Changes\nRemoved API.\n\n# 1.5.0\nFixed behavior.';
  const adapter = createEvidenceSourceAdapter({
    cache: memoryCache(),
    fetch: async () => response(same)
  });
  const enriched = await adapter.enrich({ packages: [pkg], sources: [
    registrySource(packageId),
    directSource(packageId, 'releaseNotes', 'https://docs.example.test/releases'),
    directSource(packageId, 'changelog', 'https://docs.example.test/changelog')
  ] });
  assert.deepEqual(enriched.evidence.map((item) => item.releaseVersions), [['1.5.0'], ['2.0.0']]);
  assert.equal(enriched.evidence.filter((item) => item.kind === 'breakingChanges').length, 1);
  assert.equal(new Set(enriched.evidence.map((item) => item.contentDigest)).size, enriched.evidence.length);
});

test('missing and failed sources produce warnings without failing other package evidence', async () => {
  const packageId = 'pypi:example';
  const pkg = packageRecord({ ecosystem: 'python', sourceIds: [
    `${packageId}:registry`, `${packageId}:changelog`, `${packageId}:migrationGuide`
  ] });
  const adapter = createEvidenceSourceAdapter({
    cache: memoryCache(),
    fetch: async (url) => String(url).includes('changelog')
      ? response('# 2.0.0\nValid release evidence.')
      : response('', 'text/plain', 404)
  });
  const enriched = await adapter.enrich({ packages: [pkg], sources: [
    registrySource(packageId),
    directSource(packageId, 'changelog', 'https://docs.example.test/changelog'),
    directSource(packageId, 'migrationGuide', 'https://docs.example.test/migration')
  ] });
  assert.equal(enriched.evidence.length, 1);
  assert.ok(enriched.warnings.some((item) => item.code === 'RELEASE_EVIDENCE_NOT_FOUND'));
  assert.ok(enriched.sources.some((item) => item.status === 'notFound'));
});

test('offline mode never fetches and reuses expired cache as stale evidence', async () => {
  const packageId = 'pypi:example';
  const pkg = packageRecord({ ecosystem: 'python', sourceIds: [`${packageId}:registry`, `${packageId}:changelog`] });
  const source = directSource(packageId, 'changelog', 'https://docs.example.test/changelog');
  const cache = memoryCache();
  const online = createEvidenceSourceAdapter({ cache, fetch: async () => response('# 2.0.0\nCached.') });
  await online.enrich({ packages: [pkg], sources: [registrySource(packageId), source] });
  for (const entry of cache.entries.values()) entry.status = 'expired';
  let calls = 0;
  const offline = createEvidenceSourceAdapter({ cache, offline: true, fetch: async () => { calls += 1; } });
  const enriched = await offline.enrich({ packages: [pkg], sources: [registrySource(packageId), source] });
  assert.equal(calls, 0);
  assert.equal(enriched.evidence.length, 1);
  assert.equal(enriched.sources[0].status, 'stale');
  assert.equal(enriched.sources[0].snapshot.freshness, 'stale');
});

test('offline cache miss is isolated and does not invoke transport', async () => {
  const packageId = 'pypi:example';
  const pkg = packageRecord({ ecosystem: 'python', sourceIds: [`${packageId}:registry`, `${packageId}:changelog`] });
  let calls = 0;
  const adapter = createEvidenceSourceAdapter({
    cache: memoryCache(), offline: true, fetch: async () => { calls += 1; }
  });
  const enriched = await adapter.enrich({ packages: [pkg], sources: [
    registrySource(packageId), directSource(packageId, 'changelog', 'https://docs.example.test/changelog')
  ] });
  assert.equal(calls, 0);
  assert.deepEqual(enriched.evidence, []);
  assert.equal(enriched.warnings[0].code, 'EVIDENCE_SOURCE_UNAVAILABLE');
});

test('evidence transport rejects redirects, invalid media, and oversized bodies with sanitized errors', async () => {
  let observed;
  await assert.rejects(fetchEvidenceDocument('https://docs.example.test/changelog', {
    maxResponseBytes: 4,
    fetchImplementation: async (_url, init) => {
      observed = init;
      return response('12345', 'text/plain');
    }
  }), (error) => error.code === 'EVIDENCE_RESPONSE_TOO_LARGE');
  assert.equal(observed.redirect, 'error');
  assert.equal(observed.credentials, 'omit');
  await assert.rejects(fetchEvidenceDocument('https://docs.example.test/changelog', {
    fetchImplementation: async () => response('binary', 'application/octet-stream')
  }), (error) => error.code === 'EVIDENCE_RESPONSE_INVALID' && !/binary/.test(error.message));
});
