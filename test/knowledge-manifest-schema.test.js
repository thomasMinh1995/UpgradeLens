import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { validateKnowledgeManifestInvariants } from '../src/knowledge-manifest.js';

const fixtureDirectory = new URL('./fixtures/knowledge-manifest/', import.meta.url);
const schema = JSON.parse(await readFile(
  new URL('../schemas/knowledge-manifest.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

async function fixture(name) {
  return JSON.parse(await readFile(new URL(name, fixtureDirectory), 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

function assertSchemaValid(value) {
  assert.equal(validateSchema(value), true, JSON.stringify(validateSchema.errors, null, 2));
}

function assertSchemaInvalid(value) {
  assert.equal(validateSchema(value), false, 'Expected the Knowledge Manifest schema to reject the value.');
}

test('Knowledge Manifest schema is Draft 2020-12 and keeps the version in the manifest contract', () => {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.schemaVersion, undefined);
  assert.equal(schema.properties.schemaVersion.const, '1.0.0');
});

test('all representative Knowledge Manifest fixtures pass schema and runtime invariants', async (t) => {
  const names = (await readdir(fixtureDirectory)).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(names, [
    'duplicate-occurrence.json',
    'minimal-empty.json',
    'multiple-project-occurrences.json',
    'offline-stale-cache.json',
    'package-not-found.json',
    'partial-missing-documentation.json',
    'resolved-npm-react.json',
    'resolved-pypi-fastapi.json',
    'scoped-npm-package.json',
    'source-conflict.json'
  ]);

  for (const name of names) {
    await t.test(name, async () => {
      const manifest = await fixture(name);
      assertSchemaValid(manifest);
      assert.deepEqual(validateKnowledgeManifestInvariants(manifest), []);
    });
  }
});

test('fixtures preserve package identity, partial states, duplicate occurrences, and provenance', async () => {
  const npm = await fixture('resolved-npm-react.json');
  const pypi = await fixture('resolved-pypi-fastapi.json');
  const scoped = await fixture('scoped-npm-package.json');
  const duplicate = await fixture('duplicate-occurrence.json');
  const partial = await fixture('partial-missing-documentation.json');

  assert.equal(npm.packages[0].latest.selection, 'dist-tag:latest');
  assert.equal(pypi.packages[0].latest.selection, 'project-info-version');
  assert.equal(scoped.packages[0].id, 'npm:@scope/package');
  assert.equal(duplicate.packages[0].occurrences.length, 2);
  assert.equal(partial.packages[0].status, 'partial');
  assert.equal(partial.packages[0].metadata.documentationUrl, null);
});

test('generator package version is recorded but is not a schema constant', async () => {
  const manifest = await fixture('minimal-empty.json');
  manifest.generator.version = '9.9.9';
  assertSchemaValid(manifest);
});

test('schema rejects missing fields, unsupported values, insecure registries, and negative counts', async () => {
  const base = await fixture('resolved-npm-react.json');
  const cases = [
    (value) => { delete value.generatedAt; },
    (value) => { value.schemaVersion = '2.0.0'; },
    (value) => { value.packages[0].ecosystem = 'java'; },
    (value) => { value.packages[0].status = 'unsupported'; },
    (value) => { value.packages[0].status = 'failed'; },
    (value) => { value.policy.registryBases.npm = 'http://registry.npmjs.org'; },
    (value) => { value.policy.registryBases.npm = 'https://registry.npmjs.org?signature=secret'; },
    (value) => { value.sources[0].url = 'https://token@example.com/package/react'; },
    (value) => { value.sources[0].trust = 'trusted'; },
    (value) => { value.warnings = [{ code: 'UNKNOWN', message: 'Unknown.', retryable: false }]; },
    (value) => { value.summary.packageCount = -1; }
  ];

  for (const mutate of cases) {
    const invalid = clone(base);
    mutate(invalid);
    assertSchemaInvalid(invalid);
  }
});

test('schema rejects absolute and parent-traversing artifact, project, and manifest paths', async () => {
  const base = await fixture('resolved-npm-react.json');
  const cases = [
    (value) => { value.input.projectManifest.artifact = '/tmp/project-manifest.json'; },
    (value) => { value.input.projectManifest.artifact = 'C:/temp/project-manifest.json'; },
    (value) => { value.input.projectManifest.artifact = '../project-manifest.json'; },
    (value) => { value.packages[0].occurrences[0].projectPath = '/Users/example/project'; },
    (value) => { value.packages[0].occurrences[0].manifest = 'services/../package.json'; },
    (value) => { value.packages[0].occurrences[0].manifest = 'services\\package.json'; }
  ];

  for (const mutate of cases) {
    const invalid = clone(base);
    mutate(invalid);
    assertSchemaInvalid(invalid);
  }
});

test('public contract rejects Knowledge Store paths, cache keys, validators, and secrets', async () => {
  const base = await fixture('resolved-npm-react.json');
  const cases = [
    (value) => { value.cache.storePath = '.upgradelens/cache/knowledge/v1'; },
    (value) => { value.sources[0].cacheKey = 'internal-key'; },
    (value) => { value.sources[0].snapshot.ETag = '"internal-validator"'; },
    (value) => { value.sources[0].snapshot['Last-Modified'] = 'Tue, 14 Jul 2026 00:00:00 GMT'; },
    (value) => { value.policy.authorizationToken = 'secret'; }
  ];

  for (const mutate of cases) {
    const invalid = clone(base);
    mutate(invalid);
    assertSchemaInvalid(invalid);
  }
});

test('schema does not allow unavailable facts to masquerade as resolved zero values', async () => {
  const notFound = await fixture('package-not-found.json');
  const resolved = await fixture('resolved-npm-react.json');
  const invalid = clone(notFound);
  invalid.packages[0].latest = clone(resolved.packages[0].latest);
  invalid.packages[0].releaseIndex = clone(resolved.packages[0].releaseIndex);

  assertSchemaInvalid(invalid);
});

test('runtime invariants reject inconsistent summary, execution, cache, and duration counts', async () => {
  const base = await fixture('resolved-npm-react.json');
  const cases = [
    ['summary.packageCount', (value) => { value.summary.packageCount = 2; }],
    ['summary.resolvedPackageCount', (value) => { value.summary.resolvedPackageCount = 0; }],
    ['summary.warningCount', (value) => { value.summary.warningCount = 1; }],
    ['research.inputOccurrenceCount', (value) => { value.research.inputOccurrenceCount = 2; }],
    ['research.sourceCount', (value) => { value.research.sourceCount = 2; }],
    ['research.partialFailureCount', (value) => { value.research.partialFailureCount = 1; }],
    ['research.durationMs', (value) => { value.research.durationMs = 999; }],
    ['summary.cacheHitCount', (value) => { value.summary.cacheHitCount = 1; }],
    ['research.cacheMissCount', (value) => { value.research.cacheMissCount = 0; }],
    ['cache.mode', (value) => { value.cache.mode = 'offline'; }]
  ];

  for (const [field, mutate] of cases) {
    const invalid = clone(base);
    mutate(invalid);
    assertSchemaValid(invalid);
    assert.ok(
      validateKnowledgeManifestInvariants(invalid).some((error) => error.startsWith(field)),
      `Expected an invariant error for ${field}.`
    );
  }
});

test('runtime invariants enforce source and warning referential integrity', async () => {
  const missingSource = await fixture('resolved-npm-react.json');
  missingSource.packages[0].sourceIds = ['npm:react:missing'];
  assertSchemaValid(missingSource);
  assert.ok(validateKnowledgeManifestInvariants(missingSource).some((error) =>
    error.includes('references unknown source npm:react:missing')));

  const missingWarningSource = await fixture('package-not-found.json');
  missingWarningSource.warnings[0].sourceId = 'npm:missing-package:unknown';
  assertSchemaValid(missingWarningSource);
  assert.ok(validateKnowledgeManifestInvariants(missingWarningSource).some((error) =>
    error.includes('references unknown source npm:missing-package:unknown')));

  const missingReleaseSource = await fixture('resolved-npm-react.json');
  missingReleaseSource.packages[0].releaseIndex[0].sourceIds = ['npm:react:unknown'];
  assertSchemaValid(missingReleaseSource);
  assert.ok(validateKnowledgeManifestInvariants(missingReleaseSource).some((error) =>
    error.includes('release references unknown source npm:react:unknown')));

  const missingPackage = await fixture('package-not-found.json');
  missingPackage.warnings[0].packageId = 'npm:unknown';
  assertSchemaValid(missingPackage);
  assert.ok(validateKnowledgeManifestInvariants(missingPackage).some((error) =>
    error.includes('references unknown package npm:unknown')));
});

test('runtime invariants enforce deterministic package, occurrence, release, source, and reference ordering', async () => {
  const npm = await fixture('resolved-npm-react.json');
  const pypi = await fixture('resolved-pypi-fastapi.json');
  const combined = clone(npm);
  combined.packages = [clone(pypi.packages[0]), clone(npm.packages[0])];
  combined.sources = [clone(npm.sources[0]), clone(pypi.sources[0])];
  combined.research.inputOccurrenceCount = 2;
  combined.research.inputPackageCount = 2;
  combined.research.researchedPackageCount = 2;
  combined.research.sourceCount = 2;
  combined.research.cacheMissCount = 2;
  combined.summary.inputOccurrenceCount = 2;
  combined.summary.packageCount = 2;
  combined.summary.resolvedPackageCount = 2;
  combined.summary.sourceCount = 2;
  combined.summary.cacheMissCount = 2;
  combined.cache.missCount = 2;
  assertSchemaValid(combined);
  assert.ok(validateKnowledgeManifestInvariants(combined).includes('packages must be sorted by id.'));

  const occurrences = await fixture('multiple-project-occurrences.json');
  occurrences.packages[0].occurrences.reverse();
  assert.ok(validateKnowledgeManifestInvariants(occurrences).some((error) =>
    error.includes('occurrences are not canonically sorted')));

  const releases = clone(npm);
  releases.packages[0].releaseIndex.unshift({
    ...clone(releases.packages[0].releaseIndex[0]),
    version: '20.0.0'
  });
  assertSchemaValid(releases);
  assert.ok(validateKnowledgeManifestInvariants(releases).some((error) =>
    error.includes('releases are not canonically sorted')));

  const sources = await fixture('source-conflict.json');
  sources.sources.reverse();
  assert.ok(validateKnowledgeManifestInvariants(sources).includes('sources must be sorted by id.'));

  const sourceIds = await fixture('source-conflict.json');
  sourceIds.packages[0].sourceIds.reverse();
  assert.ok(validateKnowledgeManifestInvariants(sourceIds).some((error) =>
    error.includes('sourceIds must be sorted lexically')));
});

test('runtime invariants enforce warning, warning-code, and conflict ordering', async () => {
  const warningCodes = await fixture('partial-missing-documentation.json');
  warningCodes.packages[0].warningCodes = ['SOURCE_CONFLICT', 'DOCUMENTATION_NOT_FOUND'];
  assertSchemaValid(warningCodes);
  assert.ok(validateKnowledgeManifestInvariants(warningCodes).some((error) =>
    error.includes('warningCodes must be sorted lexically')));

  const warnings = await fixture('partial-missing-documentation.json');
  warnings.packages[0].warningCodes = ['CACHE_EXPIRED', 'DOCUMENTATION_NOT_FOUND'];
  warnings.warnings.unshift({
    code: 'CACHE_EXPIRED',
    packageId: 'npm:react',
    sourceId: 'npm:react:documentation',
    message: 'Expired cached knowledge was used.',
    retryable: true
  });
  warnings.warnings.reverse();
  warnings.summary.warningCount = 2;
  assertSchemaValid(warnings);
  assert.ok(validateKnowledgeManifestInvariants(warnings).some((error) =>
    error.startsWith('warnings must be sorted')));

  const conflicts = await fixture('source-conflict.json');
  const extra = clone(conflicts.sources[0]);
  extra.id = 'npm:react:advisory';
  extra.kind = 'community';
  extra.authority = 'community';
  extra.trust = 'community';
  extra.url = 'https://example.com/react-advisory';
  extra.discoveredFrom = null;
  extra.trustEvidenceSourceIds = [];
  delete extra.conflictsWith;
  conflicts.sources.unshift(extra);
  conflicts.sources[1].conflictsWith = ['npm:react:registry', 'npm:react:advisory'];
  conflicts.research.sourceCount = 3;
  conflicts.summary.sourceCount = 3;
  assertSchemaValid(conflicts);
  assert.ok(validateKnowledgeManifestInvariants(conflicts).some((error) =>
    error.includes('conflictsWith must be sorted lexically')));
});
