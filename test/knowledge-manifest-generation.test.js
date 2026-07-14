import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildKnowledgeManifest,
  createResearchId,
  validateKnowledgeManifest
} from '../src/knowledge-manifest-builder.js';
import { serializeKnowledgeManifest, writeKnowledgeManifest } from '../src/knowledge-manifest-writer.js';
import { runCli } from '../src/cli.js';

const manifestFixtureDirectory = new URL('./fixtures/knowledge-manifest/', import.meta.url);
const npmFixtureDirectory = new URL('./fixtures/npm/', import.meta.url);

async function fixture(name) {
  return JSON.parse(await fs.readFile(new URL(name, manifestFixtureDirectory), 'utf8'));
}

function capture() {
  let value = '';
  return { stream: { write(chunk) { value += chunk; } }, value: () => value };
}

function researchResultFrom(manifest) {
  return {
    resultVersion: '1',
    input: { projectManifest: structuredClone(manifest.input.projectManifest), researchPlanVersion: '1' },
    execution: {
      startedAt: manifest.research.startedAt,
      completedAt: manifest.research.completedAt,
      durationMs: manifest.research.durationMs,
      concurrency: 4,
      inputPackageCount: manifest.packages.length,
      adapterInvocationCount: manifest.packages.length,
      adapterInvocationCounts: { npm: manifest.packages.filter((item) => item.identity.registry === 'npm').length, pypi: 0 },
      sourceCount: manifest.sources.length,
      warningCount: manifest.warnings.length,
      partialFailureCount: manifest.research.partialFailureCount,
      cacheHitCount: manifest.cache.hitCount,
      cacheMissCount: manifest.cache.missCount,
      cacheRevalidationCount: manifest.cache.revalidationCount,
      cacheCorruptionReplacementCount: 0,
      cacheCorruptedCount: 0,
      packageOutcomes: []
    },
    summary: {
      inputOccurrenceCount: manifest.summary.inputOccurrenceCount,
      packageCount: manifest.packages.length,
      resolvedPackageCount: manifest.summary.resolvedPackageCount,
      partialPackageCount: manifest.summary.partialPackageCount,
      notFoundPackageCount: manifest.summary.notFoundPackageCount,
      invalidPackageCount: manifest.summary.invalidPackageCount,
      unavailablePackageCount: manifest.summary.unavailablePackageCount,
      invalidOccurrenceCount: 0,
      unsupportedOccurrenceCount: 0,
      sourceCount: manifest.sources.length,
      warningCount: manifest.warnings.length,
      cacheHitCount: manifest.cache.hitCount,
      cacheMissCount: manifest.cache.missCount,
      cacheRevalidationCount: manifest.cache.revalidationCount,
      cacheCorruptionReplacementCount: 0,
      cacheCorruptedCount: 0,
      retryCount: manifest.research.retryCount,
      partialFailureCount: manifest.research.partialFailureCount
    },
    packages: structuredClone(manifest.packages),
    sources: structuredClone(manifest.sources),
    warnings: structuredClone(manifest.warnings),
    invalidOccurrences: [],
    unsupported: []
  };
}

async function repository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upgradelens-research-cli-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'research-cli-fixture', version: '1.0.0', dependencies: { react: '^19.2.0' }
  }));
  return root;
}

test('builds a public Knowledge Manifest from an internal result without mutation', async () => {
  const source = await fixture('resolved-npm-react.json');
  const result = researchResultFrom(source);
  const before = structuredClone(result);
  const manifest = buildKnowledgeManifest(result);
  assert.equal(manifest.schemaVersion, '1.0.0');
  assert.deepEqual(validateKnowledgeManifest(manifest), manifest);
  assert.deepEqual(result, before);
  assert.equal(Object.hasOwn(manifest.packages[0].occurrences[0], 'ecosystem'), false);
  assert.equal(Object.hasOwn(manifest.packages[0].occurrences[0], 'normalizedName'), false);
});

test('researchId is deterministic for equivalent ordered source facts and policy', async () => {
  const manifest = await fixture('resolved-npm-react.json');
  const policy = manifest.policy;
  const first = createResearchId(manifest.input, policy, manifest.sources);
  const second = createResearchId(manifest.input, structuredClone(policy), [...manifest.sources].reverse());
  assert.equal(first, second);
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
});

test('builder canonicalizes package ordering without changing researchId', async () => {
  const npm = await fixture('resolved-npm-react.json');
  const pypi = await fixture('resolved-pypi-fastapi.json');
  const result = researchResultFrom(npm);
  result.packages = [...npm.packages, ...pypi.packages];
  result.sources = [...npm.sources, ...pypi.sources];
  result.summary.inputOccurrenceCount = npm.summary.inputOccurrenceCount + pypi.summary.inputOccurrenceCount;
  result.summary.packageCount = 2;
  result.summary.resolvedPackageCount = 2;
  result.summary.sourceCount = result.sources.length;
  result.summary.cacheHitCount = npm.summary.cacheHitCount + pypi.summary.cacheHitCount;
  result.summary.cacheMissCount = npm.summary.cacheMissCount + pypi.summary.cacheMissCount;
  result.summary.cacheRevalidationCount = 0;
  result.summary.partialFailureCount = 0;
  const first = buildKnowledgeManifest(result);
  result.packages.reverse();
  result.sources.reverse();
  const second = buildKnowledgeManifest(result);
  assert.deepEqual(first.packages.map((item) => item.id), ['npm:react', 'pypi:fastapi']);
  assert.equal(first.research.researchId, second.research.researchId);
  assert.deepEqual(first.packages, second.packages);
});

test('serializes and atomically replaces validated manifests as UTF-8 pretty JSON with a final newline', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upgradelens-knowledge-writer-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, '.upgradelens', 'knowledge-manifest.json');
  const manifest = buildKnowledgeManifest(researchResultFrom(await fixture('resolved-npm-react.json')));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'old manifest');
  await writeKnowledgeManifest(target, manifest);
  const contents = await fs.readFile(target, 'utf8');
  assert.equal(contents, serializeKnowledgeManifest(manifest));
  assert.ok(contents.endsWith('\n'));
  assert.match(contents, /\n  "schemaVersion": "1.0.0"/);
  assert.deepEqual(JSON.parse(contents), manifest);
  assert.deepEqual((await fs.readdir(path.dirname(target))).filter((name) => name.endsWith('.tmp')), []);

  const invalid = structuredClone(manifest);
  invalid.schemaVersion = '9.0.0';
  await assert.rejects(writeKnowledgeManifest(path.join(root, 'invalid.json'), invalid), /schema validation failed/);
  await assert.rejects(fs.access(path.join(root, 'invalid.json')));
});

test('research CLI writes the default/custom artifact and --stdout prints only JSON', async (t) => {
  const root = await repository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const packument = JSON.parse(await fs.readFile(new URL('react-packument.json', npmFixtureDirectory), 'utf8'));
  const fetch = async () => new Response(JSON.stringify(packument), { status: 200, headers: { 'content-type': 'application/json' } });
  assert.equal(await runCli(['discover', root], { stdout: capture().stream, stderr: capture().stream }), 0);

  const stderr = capture();
  assert.equal(await runCli(['research', root], { stdout: capture().stream, stderr: stderr.stream, fetch }), 0);
  const defaultPath = path.join(root, '.upgradelens', 'knowledge-manifest.json');
  assert.equal(JSON.parse(await fs.readFile(defaultPath, 'utf8')).schemaVersion, '1.0.0');
  assert.match(stderr.value(), /Planned research \(1 packages\)/);

  const stdout = capture();
  assert.equal(await runCli(['research', root, '--stdout'], { stdout: stdout.stream, stderr: capture().stream, fetch }), 0);
  assert.equal(JSON.parse(stdout.value()).packages[0].id, 'npm:react');

  assert.equal(await runCli(['research', root, '--output', 'artifacts/knowledge.json'], {
    stdout: capture().stream, stderr: capture().stream, fetch
  }), 0);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'artifacts/knowledge.json'), 'utf8')).schemaVersion, '1.0.0');
});

test('offline research uses a fresh cache without fetch and emits unavailable cache-miss facts when absent', async (t) => {
  const root = await repository();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const packument = JSON.parse(await fs.readFile(new URL('react-packument.json', npmFixtureDirectory), 'utf8'));
  let calls = 0;
  const onlineFetch = async () => { calls += 1; return new Response(JSON.stringify(packument), { status: 200, headers: { 'content-type': 'application/json' } }); };
  await runCli(['discover', root], { stdout: capture().stream, stderr: capture().stream });
  await runCli(['research', root], { stdout: capture().stream, stderr: capture().stream, fetch: onlineFetch });
  assert.equal(calls, 1);
  const stdout = capture();
  const noFetch = async () => { throw new Error('network must not run'); };
  assert.equal(await runCli(['research', root, '--offline', '--stdout'], {
    stdout: stdout.stream, stderr: capture().stream, fetch: noFetch
  }), 0);
  assert.equal(JSON.parse(stdout.value()).packages[0].status, 'resolved');

  const cold = await repository();
  t.after(() => fs.rm(cold, { recursive: true, force: true }));
  await runCli(['discover', cold], { stdout: capture().stream, stderr: capture().stream });
  const coldStdout = capture();
  assert.equal(await runCli(['research', cold, '--offline', '--stdout'], {
    stdout: coldStdout.stream, stderr: capture().stream, fetch: noFetch
  }), 0);
  const offline = JSON.parse(coldStdout.value());
  assert.equal(offline.packages[0].status, 'unavailable');
  assert.ok(offline.warnings.some((warning) => warning.code === 'OFFLINE_CACHE_MISS'));
});
