import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createKnowledgeResearchOrchestrator, validateKnowledgeResearchResult } from '../src/knowledge-research.js';
import { createKnowledgeCache } from '../src/knowledge-cache.js';
import { createResearchPlan } from '../src/research-plan.js';
import { loadProjectManifestInput } from '../src/project-manifest-input.js';
import { createNpmRegistryAdapter } from '../src/registry/npm-registry-adapter.js';
import { createPypiRegistryAdapter } from '../src/registry/pypi-registry-adapter.js';
import { resolveSourceProvenance } from '../src/source-provenance.js';

const planFixtureDirectory = new URL('./fixtures/research-plan/', import.meta.url);
const fixtureDirectory = new URL('./fixtures/knowledge-research/', import.meta.url);
const npmFixtureDirectory = new URL('./fixtures/npm/', import.meta.url);
const pypiFixtureDirectory = new URL('./fixtures/pypi/', import.meta.url);

async function fixture(name) {
  return JSON.parse(await fs.readFile(new URL(name, fixtureDirectory), 'utf8'));
}

async function planFromFixture(name = 'node-python-project-manifest.json') {
  const bytes = await fs.readFile(new URL(name, planFixtureDirectory));
  return createResearchPlan(await loadProjectManifestInput({
    bytes,
    artifact: '.upgradelens/project-manifest.json'
  }));
}

function vinGradeLikePlan() {
  const nodeNames = [
    'react', 'react-dom', 'react-router-dom', 'axios', 'clsx', 'lucide-react', 'tailwind-merge', 'zod', 'zustand',
    '@eslint/js', '@types/node', '@types/react', '@types/react-dom', '@vitejs/plugin-react', 'eslint',
    'eslint-plugin-react-hooks', 'eslint-plugin-react-refresh', 'typescript', 'vite'
  ];
  const pythonNames = [
    'flask', 'Django', 'requests', 'urllib3', 'fastapi', 'pydantic', 'sqlalchemy', 'alembic', 'packaging', 'uvicorn',
    'colorama', 'httpx', 'pytest', 'pytest-cov', 'ruff', 'mypy', 'celery', 'redis', 'boto3', 'numpy', 'pandas',
    'scipy', 'Pillow', 'cryptography', 'python-dotenv', 'orjson', 'langchain-openai', 'LangChain_OpenAI'
  ];
  const nodeDependencies = nodeNames.map((name, index) => ({
    name, normalizedName: name, declaredVersion: '^1.0.0', type: index < 9 ? 'dependency' : 'devDependency', manifest: 'FE/package.json'
  }));
  const pythonDependencies = pythonNames.map((name) => ({
    name, normalizedName: name.toLowerCase().replace(/[-_.]+/g, '-'), declaredVersion: '>=1.0.0', type: 'runtime', manifest: 'requirements.txt'
  }));
  return createResearchPlan({
    manifest: {
      projects: [
        { id: 'node:FE', path: 'FE', ecosystem: 'node', dependencies: nodeDependencies },
        { id: 'python:.', path: '.', ecosystem: 'python', dependencies: pythonDependencies }
      ]
    },
    input: {
      projectManifest: {
        schemaVersion: '2.0.0', artifact: '.upgradelens/project-manifest.json',
        artifactDigest: `sha256:${'a'.repeat(64)}`, repository: { name: 'vingrade-like', root: '.' }
      }
    }
  });
}

function urlsFor(researchPackage) {
  if (researchPackage.registry === 'npm') {
    return {
      registryBaseUrl: 'https://registry.example.test',
      packageUrl: `https://www.npmjs.com/package/${researchPackage.normalizedName}`,
      apiUrl: `https://registry.example.test/${encodeURIComponent(researchPackage.normalizedName)}`
    };
  }
  return {
    registryBaseUrl: 'https://pypi.example.test',
    packageUrl: `https://pypi.example.test/project/${researchPackage.normalizedName}/`,
    apiUrl: `https://pypi.example.test/pypi/${researchPackage.normalizedName}/json`
  };
}

function registryResult(researchPackage, {
  status = 'resolved', cacheOutcome = 'miss', metadata = {}, sourceCandidates = [], warnings = []
} = {}) {
  const sourceId = `${researchPackage.id}:registry`;
  const urls = urlsFor(researchPackage);
  return {
    package: {
      id: researchPackage.id,
      ecosystem: researchPackage.ecosystem,
      status,
      identity: {
        observedDeclaredNames: researchPackage.observedDeclaredNames,
        normalizedName: researchPackage.normalizedName,
        registry: researchPackage.registry,
        ...urls
      },
      occurrences: researchPackage.occurrences,
      metadata,
      latest: status === 'resolved' ? {
        version: '1.0.0', selection: researchPackage.registry === 'npm' ? 'dist-tag:latest' : 'project-info-version',
        publishedAt: null, releaseUrl: null, prerelease: null, yanked: null, deprecated: null, sourceId
      } : null,
      releaseIndex: [],
      sourceIds: [sourceId],
      warningCodes: [...new Set(warnings.map((warning) => warning.code))].sort()
    },
    source: {
      id: sourceId,
      kind: 'registry',
      authority: 'registryAuthoritative',
      trust: 'publisher',
      url: urls.packageUrl,
      apiUrl: urls.apiUrl,
      status: status === 'notFound' ? 'notFound' : status === 'unavailable' ? 'unavailable' : 'available',
      supports: ['identity', 'metadata'],
      discoveredFrom: null,
      trustEvidenceSourceIds: [],
      snapshot: null
    },
    sourceCandidates,
    cache: cacheOutcome === null ? {} : { outcome: cacheOutcome },
    warnings
  };
}

function clock(...values) {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]);
}

function configured(plan, handlers, options = {}) {
  const calls = { npm: [], pypi: [] };
  const adapters = Object.fromEntries(['npm', 'pypi'].map((registry) => [registry, {
    async researchPackage(researchPackage) {
      calls[registry].push(researchPackage.id);
      const handler = handlers[researchPackage.id] ?? handlers[registry];
      return handler ? handler(researchPackage) : registryResult(researchPackage);
    }
  }]));
  return {
    calls,
    orchestrator: createKnowledgeResearchOrchestrator({
      adapters,
      clock: options.clock ?? clock('2026-07-14T00:00:00.000Z', '2026-07-14T00:00:01.000Z'),
      concurrency: options.concurrency ?? 4,
      sourceProvenanceResolver: options.sourceProvenanceResolver
    })
  };
}

test('an empty validated Research Plan returns an empty internal result without adapter invocations', async () => {
  const plan = await planFromFixture('empty-project-manifest.json');
  const { calls, orchestrator } = configured(plan, {});
  const result = await orchestrator.run(plan);
  assert.deepEqual(await fixture('empty-plan.json'), {
    planVersion: '1',
    summary: {
      inputOccurrenceCount: 0, researchableOccurrenceCount: 0, uniqueResearchPackageCount: 0,
      invalidOccurrenceCount: 0, unsupportedOccurrenceCount: 0
    }, packages: [], invalidOccurrences: [], unsupported: []
  });
  assert.equal(result.resultVersion, '1');
  assert.equal(result.summary.packageCount, 0);
  assert.deepEqual(result.packages, []);
  assert.deepEqual(calls, { npm: [], pypi: [] });
});

test('selects npm and PyPI solely by registry and preserves package occurrences', async () => {
  const plan = await planFromFixture();
  const expected = await fixture('mixed-plan.json');
  const { calls, orchestrator } = configured(plan, {
    npm: (item) => registryResult(item, { metadata: { documentationUrl: `https://docs.example.test/${item.normalizedName}/` } }),
    pypi: (item) => registryResult(item, { metadata: { repositoryUrl: 'https://github.com/example/fastapi' } })
  });
  const result = await orchestrator.run(plan);
  assert.deepEqual(result.packages.map((item) => item.id), expected.packages);
  assert.deepEqual(calls, { npm: ['npm:react', 'npm:vite'], pypi: ['pypi:fastapi'] });
  assert.equal(result.summary.packageCount, expected.expected.packageCount);
  assert.equal(result.execution.adapterInvocationCount, 3);
  assert.deepEqual(result.packages.find((item) => item.id === 'npm:react').occurrences, plan.packages.find((item) => item.id === 'npm:react').occurrences);
  assert.ok(result.packages.every((item) => item.sourceIds.every((sourceId) => result.sources.some((source) => source.id === sourceId))));
});

test('combines real npm and PyPI adapters with fixture-backed fetches without network access', async (t) => {
  const plan = await planFromFixture();
  plan.packages = plan.packages.filter((item) => item.id !== 'npm:vite');
  plan.summary.inputOccurrenceCount = 2;
  plan.summary.researchableOccurrenceCount = 2;
  plan.summary.uniqueResearchPackageCount = 2;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upgradelens-research-orchestration-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const react = JSON.parse(await fs.readFile(new URL('react-packument.json', npmFixtureDirectory), 'utf8'));
  const fastapi = JSON.parse(await fs.readFile(new URL('fastapi-project.json', pypiFixtureDirectory), 'utf8'));
  const now = clock('2026-07-14T00:00:00.000Z', '2026-07-14T00:00:01.000Z');
  const fetch = async (url) => new Response(JSON.stringify(url.includes('/fastapi/') ? fastapi : react), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
  const orchestrator = createKnowledgeResearchOrchestrator({
    adapters: {
      npm: createNpmRegistryAdapter({
        registryBaseUrl: 'https://registry.example.test', fetch,
        cache: createKnowledgeCache({ rootDirectory: path.join(root, 'npm'), clock: now }), clock: now
      }),
      pypi: createPypiRegistryAdapter({
        registryBaseUrl: 'https://pypi.example.test', indexBaseUrl: 'https://pypi.example.test/simple', fetch,
        cache: createKnowledgeCache({ rootDirectory: path.join(root, 'pypi'), clock: now }), clock: now
      })
    },
    clock: now
  });
  const result = await orchestrator.run(plan);
  assert.deepEqual(result.packages.map((item) => item.id), ['npm:react', 'pypi:fastapi']);
  assert.deepEqual(result.execution.adapterInvocationCounts, { npm: 1, pypi: 1 });
  assert.equal(result.summary.cacheMissCount, 2);
  assert.ok(result.sources.some((source) => source.supports.includes('documentation')));
});

test('uses bounded concurrency and canonicalizes output independently of completion order', async () => {
  const plan = await planFromFixture();
  let active = 0;
  let maximum = 0;
  const delayed = (delay) => async (item) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active -= 1;
    return registryResult(item);
  };
  const first = configured(plan, { 'npm:react': delayed(20), 'npm:vite': delayed(1), 'pypi:fastapi': delayed(10) }, { concurrency: 2 });
  const one = await first.orchestrator.run(plan);
  assert.equal(maximum, 2);
  const second = configured(plan, { 'npm:react': delayed(1), 'npm:vite': delayed(20), 'pypi:fastapi': delayed(10) }, { concurrency: 2 });
  const two = await second.orchestrator.run(plan);
  assert.deepEqual(one, two);
});

test('isolates factual package outcomes, unexpected failures, and a missing adapter', async () => {
  const plan = await planFromFixture();
  const partial = await fixture('partial-results.json');
  const { orchestrator } = configured(plan, {
    'npm:react': (item) => registryResult(item, { status: 'notFound', cacheOutcome: 'hit', warnings: [{
      code: 'PACKAGE_NOT_FOUND', packageId: item.id, sourceId: `${item.id}:registry`, message: 'Package was not found.', retryable: false
    }] }),
    'npm:vite': () => { throw new Error('secret response body and stack'); },
    'pypi:fastapi': (item) => registryResult(item, { status: 'partial', cacheOutcome: 'revalidated' })
  });
  const result = await orchestrator.run(plan);
  assert.equal(result.packages.find((item) => item.id === 'npm:react').status, 'notFound');
  assert.equal(result.packages.find((item) => item.id === 'npm:vite').status, 'unavailable');
  assert.equal(result.packages.find((item) => item.id === 'pypi:fastapi').status, 'partial');
  assert.equal(result.summary.partialFailureCount, 3);
  assert.equal(result.summary.cacheHitCount, 1);
  assert.equal(result.summary.cacheRevalidationCount, 1);
  assert.doesNotMatch(JSON.stringify(result), /secret response|stack/);
  assert.equal(partial.statuses.notFound, 1);

  const missing = createKnowledgeResearchOrchestrator({
    adapters: { npm: { researchPackage: async (item) => registryResult(item) } },
    clock: clock('2026-07-14T00:00:00.000Z', '2026-07-14T00:00:01.000Z')
  });
  const missingResult = await missing.run(plan);
  assert.equal(missingResult.packages.find((item) => item.id === 'pypi:fastapi').status, 'unavailable');
  assert.ok(missingResult.warnings.some((warning) => warning.packageId === 'pypi:fastapi' && warning.code === 'REGISTRY_UNAVAILABLE'));
});

test('aggregates cache outcomes and source conflicts after all registry work completes', async () => {
  const plan = await planFromFixture();
  const calls = [];
  const closure = configured(plan, {
    'npm:react': async (item) => {
      calls.push('react-2');
      return registryResult(item, { cacheOutcome: 'corrupted-replaced', metadata: { documentationUrl: 'https://docs-a.example.test/' }, sourceCandidates: [{ role: 'documentation', url: 'https://docs-b.example.test/' }] });
    },
    'npm:vite': async (item) => { calls.push('vite-2'); return registryResult(item, { cacheOutcome: 'miss' }); },
    'pypi:fastapi': async (item) => { calls.push('fastapi-2'); return registryResult(item, { cacheOutcome: 'corrupted' }); }
  }, { sourceProvenanceResolver: (results) => { assert.equal(calls.length, 3); return resolveSourceProvenance(results); } });
  const result = await closure.orchestrator.run(plan);
  assert.equal(result.summary.cacheCorruptionReplacementCount, 1);
  assert.equal(result.summary.cacheMissCount, 1);
  assert.equal(result.summary.cacheCorruptedCount, 1);
  assert.equal(result.packages.find((item) => item.id === 'npm:react').status, 'partial');
  assert.equal(result.warnings.filter((warning) => warning.code === 'SOURCE_CONFLICT').length, 2);
});

test('keeps invalid occurrences and unsupported aggregates outside registry package identities', async () => {
  const plan = await planFromFixture('empty-project-manifest.json');
  const invalid = {
    projectId: 'node:FE', projectPath: 'FE', manifest: 'FE/package.json', ecosystem: 'node', dependencyType: 'dependency',
    declaredName: 'file:../private', normalizedName: 'file:../private', declaredVersion: '<local-path-reference>', reason: 'unsupported-reference'
  };
  plan.invalidOccurrences = [invalid];
  plan.unsupported = [{ ecosystem: 'java', projectIds: ['java:backend'], occurrenceCount: 1 }];
  plan.warnings = [{
    code: 'INVALID_PACKAGE_REFERENCE', projectId: invalid.projectId, manifest: invalid.manifest, dependencyType: invalid.dependencyType,
    declaredName: invalid.declaredName, declaredVersion: invalid.declaredVersion,
    message: 'Dependency reference is not a supported public node package identity.'
  }, {
    code: 'UNSUPPORTED_RESEARCH_ECOSYSTEM', ecosystem: 'java',
    message: 'Dependencies in java projects are not supported by MVP-02 research planning.'
  }].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  plan.summary.invalidOccurrenceCount = 1;
  plan.summary.unsupportedOccurrenceCount = 1;
  plan.summary.inputOccurrenceCount = 2;
  const { calls, orchestrator } = configured(plan, {});
  const result = await orchestrator.run(plan);
  assert.deepEqual(result.invalidOccurrences, [invalid]);
  assert.deepEqual(result.unsupported, plan.unsupported);
  assert.equal(result.summary.invalidOccurrenceCount, 1);
  assert.equal(result.summary.unsupportedOccurrenceCount, 1);
  assert.ok(result.warnings.some((warning) => warning.code === 'INVALID_PACKAGE_REFERENCE' && !warning.packageId));
  assert.equal(calls.npm.length + calls.pypi.length, 0);
  assert.deepEqual(await fixture('invalid-and-unsupported.json'), {
    invalidReason: 'unsupported-reference', unsupportedEcosystem: 'java', expectedAdapterInvocations: 0
  });
});

test('runs the VinGrade-like 47-occurrence plan with deterministic package-centric totals', async () => {
  const plan = vinGradeLikePlan();
  const { calls, orchestrator } = configured(plan, {
    npm: (item) => registryResult(item, { cacheOutcome: 'hit' }),
    pypi: (item) => registryResult(item, { cacheOutcome: 'miss' })
  });
  const result = await orchestrator.run(plan);
  assert.equal(plan.summary.inputOccurrenceCount, 47);
  assert.equal(result.summary.packageCount, 46);
  assert.deepEqual(result.execution.adapterInvocationCounts, { npm: 19, pypi: 27 });
  assert.equal(calls.npm.length, 19);
  assert.equal(calls.pypi.length, 27);
  assert.equal(result.summary.sourceCount, 46);
  assert.equal(result.summary.warningCount, 0);
  assert.equal(result.summary.cacheHitCount, 19);
  assert.equal(result.summary.cacheMissCount, 27);
  assert.deepEqual(result.packages.find((item) => item.id === 'pypi:langchain-openai').occurrences.map((item) => item.declaredName), [
    'LangChain_OpenAI', 'langchain-openai'
  ]);
});

test('fails before adapter invocation for an invalid Research Plan and rejects unsafe internal output', async () => {
  const plan = await planFromFixture();
  const invalidPlan = structuredClone(plan);
  invalidPlan.summary.uniqueResearchPackageCount = 99;
  let calls = 0;
  const orchestrator = createKnowledgeResearchOrchestrator({
    adapters: { npm: { researchPackage: async () => { calls += 1; return null; } } }
  });
  await assert.rejects(orchestrator.run(invalidPlan), /Research Plan invariant violation/);
  assert.equal(calls, 0);
  const unsupportedFieldPlan = structuredClone(plan);
  unsupportedFieldPlan.packages[0].cacheKey = 'must-not-be-accepted';
  await assert.rejects(orchestrator.run(unsupportedFieldPlan), /unsupported field cacheKey/);
  assert.equal(calls, 0);

  const unsafe = configured(plan, {
    npm: (item) => registryResult(item, { metadata: { description: '/private/cache/entry' } })
  });
  await assert.rejects(unsafe.orchestrator.run(plan), /absolute local path/);
  const credentialed = configured(plan, {
    npm: (item) => registryResult(item, { metadata: { description: 'https://docs.example.test/?token=secret' } })
  });
  await assert.rejects(credentialed.orchestrator.run(plan), /query token/);

  const safe = configured(plan, {});
  const result = await safe.orchestrator.run(plan);
  const broken = structuredClone(result);
  broken.summary.packageCount += 1;
  assert.throws(() => validateKnowledgeResearchResult(broken, plan), /summary.packageCount/);
});

test('uses the injected clock and rejects invalid concurrency values', async () => {
  const plan = await planFromFixture();
  const { orchestrator } = configured(plan, {}, {
    clock: clock('2026-07-14T00:00:00.000Z', '2026-07-14T00:00:01.250Z'), concurrency: 1
  });
  const result = await orchestrator.run(plan);
  assert.equal(result.execution.durationMs, 1250);
  assert.equal(result.execution.concurrency, 1);
  assert.throws(() => createKnowledgeResearchOrchestrator({ concurrency: 0 }), /concurrency/);
  await assert.rejects(orchestrator.run(plan, { concurrency: 33 }), /concurrency/);
});
