import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import test from 'node:test';

import { resolveSourceProvenance, validateSourceGraph } from '../src/source-provenance.js';
import { canonicalizeSourceUrl } from '../src/source-url.js';

const fixtureDirectory = new URL('./fixtures/source-provenance/', import.meta.url);

async function fixture(name) {
  return JSON.parse(await fs.readFile(new URL(name, fixtureDirectory), 'utf8'));
}

function registryResult({
  packageId = 'npm:example',
  sourceId = `${packageId}:registry`,
  metadata = {},
  sourceCandidates = [],
  url = `https://registry.example.test/${encodeURIComponent(packageId)}`
} = {}) {
  return {
    package: { id: packageId, metadata },
    source: {
      id: sourceId,
      kind: 'registry',
      authority: 'registryAuthoritative',
      trust: 'publisher',
      url,
      status: 'available',
      supports: ['identity', 'metadata'],
      discoveredFrom: null,
      trustEvidenceSourceIds: [],
      snapshot: null
    },
    sourceCandidates
  };
}

function nonRegistry(graph) {
  return graph.sources.filter((source) => source.kind !== 'registry');
}

test('preserves registry records and turns npm metadata into deterministic source records', async () => {
  const graph = resolveSourceProvenance([await fixture('npm-react.json')]);
  const documentation = nonRegistry(graph).find((source) => source.supports.includes('documentation'));
  const repository = nonRegistry(graph).find((source) => source.supports.includes('repository'));
  const issues = nonRegistry(graph).find((source) => source.supports.includes('issues'));

  assert.deepEqual(graph.sources.find((source) => source.id === 'npm:react:registry'), (await fixture('npm-react.json')).source);
  assert.equal(documentation.url, 'https://react.dev');
  assert.deepEqual(documentation.supports, ['documentation', 'homepage']);
  assert.equal(documentation.kind, 'officialDocumentation');
  assert.equal(repository.url, 'https://github.com/facebook/react');
  assert.equal(repository.kind, 'sourceRepository');
  assert.equal(issues.url, 'https://github.com/facebook/react/issues');
  assert.notEqual(repository.id, issues.id);
  assert.equal(documentation.authority, 'publisherProvided');
  assert.equal(documentation.trust, 'publisher');
  assert.equal(documentation.status, 'unverified');
  assert.equal(documentation.discoveredFrom, 'npm:react:registry');
  assert.equal(documentation.snapshot, null);
});

test('resolves PyPI documentation and private changelog candidates without changing public metadata', async () => {
  const graph = resolveSourceProvenance([await fixture('pypi-fastapi.json')]);
  const sources = nonRegistry(graph);
  assert.equal(sources.find((source) => source.supports.includes('documentation')).url, 'https://fastapi.tiangolo.com');
  assert.equal(sources.find((source) => source.supports.includes('changelog')).url, 'https://fastapi.tiangolo.com/release-notes');
  assert.equal(sources.find((source) => source.supports.includes('issues')).kind, 'sourceRepository');
});

test('classifies release-note and release-feed candidates without fetching them', () => {
  const graph = resolveSourceProvenance([registryResult({ sourceCandidates: [
    { role: 'releaseNotes', url: 'https://docs.example.test/releases/notes/' },
    { role: 'releases', url: 'https://releases.example.test/project/' }
  ] })]);
  const releaseNotes = nonRegistry(graph).find((source) => source.supports.includes('releaseNotes'));
  const releaseFeed = nonRegistry(graph).find((source) => source.supports.includes('releases'));
  assert.equal(releaseNotes.kind, 'officialDocumentation');
  assert.equal(releaseFeed.kind, 'releaseFeed');
  assert.equal(releaseNotes.status, 'unverified');
  assert.equal(releaseFeed.snapshot, null);
});

test('normalizes safe Git URLs, fragments, and GitHub suffixes without changing meaningful paths', () => {
  assert.equal(canonicalizeSourceUrl('git+https://github.com/owner/repo.git', { role: 'repository' }), 'https://github.com/owner/repo');
  assert.equal(canonicalizeSourceUrl('https://example.test/docs/#intro'), 'https://example.test/docs');
  assert.equal(canonicalizeSourceUrl('https://github.com/owner/repo/issues'), 'https://github.com/owner/repo/issues');
  assert.equal(canonicalizeSourceUrl('git+https://github.com/owner/repo.git', { role: 'documentation' }), null);
});

test('rejects unsafe, local, query-bearing, and malformed source URLs without adding references', async () => {
  const graph = resolveSourceProvenance([await fixture('unsafe-urls.json')]);
  assert.deepEqual(graph.packages[0].sourceIds, ['npm:unsafe:registry']);
  assert.equal(nonRegistry(graph).length, 0);
  for (const value of [
    'https://user:pass@example.test/docs', 'http://example.test/docs', 'https://localhost/docs', 'https://localhost./docs',
    'https://169.254.1.1/docs', 'https://192.168.1.1/docs', 'https://example.test/docs?token=x',
    'file:///tmp/a', 'data:text/plain,hello', 'ssh://git@example.test/repo', 'not a URL'
  ]) assert.equal(canonicalizeSourceUrl(value, { role: 'repository' }), null);
});

test('is package-scoped, deterministic, and does not infer official trust from a URL', () => {
  const npm = registryResult({ packageId: 'npm:shared', metadata: { documentationUrl: 'https://docs.example.test/' } });
  const pypi = registryResult({
    packageId: 'pypi:shared', sourceId: 'pypi:shared:registry', metadata: { documentationUrl: 'https://docs.example.test/' }
  });
  const first = resolveSourceProvenance([npm, pypi]);
  const second = resolveSourceProvenance([pypi, npm]);
  assert.deepEqual(first, second);
  const docs = nonRegistry(first);
  assert.equal(docs.length, 2);
  assert.notEqual(docs[0].id, docs[1].id);
  assert.ok(docs.every((source) => source.trust === 'publisher' && source.authority === 'publisherProvided'));
  assert.ok(docs.every((source) => source.trust !== 'official'));
});

test('upgrades trust only for independent registry assertions of the same package relationship', async () => {
  const graph = resolveSourceProvenance(await fixture('corroborated-source.json'));
  const source = nonRegistry(graph)[0];
  assert.equal(source.trust, 'verified');
  assert.deepEqual(source.trustEvidenceSourceIds, ['npm:shared:registry', 'npm:shared:registry-secondary']);

  const repeated = resolveSourceProvenance([registryResult({
    metadata: { homepageUrl: 'https://docs.example.test/', documentationUrl: 'https://docs.example.test/' }
  })]);
  assert.equal(nonRegistry(repeated)[0].trust, 'publisher');
});

test('keeps conflicting roles separate, links conflicts symmetrically, and emits deterministic warnings', async () => {
  const first = await fixture('conflicting-sources.json');
  const second = registryResult({
    packageId: 'npm:example',
    sourceId: 'npm:example:registry-secondary',
    metadata: { documentationUrl: 'https://docs-c.example.test/' }
  });
  const graph = resolveSourceProvenance([second, first]);
  const docs = nonRegistry(graph).filter((source) => source.supports.includes('documentation'));
  assert.equal(docs.length, 3);
  assert.ok(docs.every((source) => source.conflictsWith.length === 2));
  assert.equal(graph.warnings.length, 3);
  assert.ok(graph.warnings.every((warning) => warning.code === 'SOURCE_CONFLICT' && warning.retryable === false));

  const noConflict = resolveSourceProvenance([registryResult({ metadata: {
    documentationUrl: 'https://docs.example.test/', repositoryUrl: 'https://github.com/example/project'
  } })]);
  assert.equal(noConflict.warnings.length, 0);
});

test('validates internal source graph invariants', () => {
  const graph = resolveSourceProvenance([registryResult({ metadata: { documentationUrl: 'https://docs.example.test/' } })]);
  assert.equal(validateSourceGraph(graph), graph);

  const unsorted = structuredClone(graph);
  unsorted.sources.reverse();
  assert.throws(() => validateSourceGraph(unsorted), /sources must be sorted/);

  const missingReference = structuredClone(graph);
  missingReference.packages[0].sourceIds.push('missing:source');
  missingReference.packages[0].sourceIds.sort();
  assert.throws(() => validateSourceGraph(missingReference), /unknown source/);

  const unsortedReferences = structuredClone(graph);
  unsortedReferences.packages[0].sourceIds.reverse();
  assert.throws(() => validateSourceGraph(unsortedReferences), /sourceIds must be sorted/);

  const asymmetric = structuredClone(graph);
  const source = nonRegistry(asymmetric)[0];
  source.conflictsWith = ['npm:example:registry'];
  assert.throws(() => validateSourceGraph(asymmetric), /invalid conflict reference/);

  const fetched = structuredClone(graph);
  const fetchedSource = nonRegistry(fetched)[0];
  fetchedSource.status = 'available';
  fetchedSource.snapshot = {
    contentDigest: `sha256:${'a'.repeat(64)}`,
    mediaType: 'text/markdown',
    retrievedAt: '2026-07-15T00:00:00.000Z',
    freshness: 'fresh'
  };
  assert.equal(validateSourceGraph(fetched), fetched);

  const missingSnapshot = structuredClone(fetched);
  nonRegistry(missingSnapshot)[0].snapshot = null;
  assert.throws(() => validateSourceGraph(missingSnapshot), /must have a snapshot/);
});
