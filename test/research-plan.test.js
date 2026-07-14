import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createResearchPlan,
  loadProjectManifestInput,
  validateResearchPlan
} from '../src/index.js';

const fixtureDirectory = new URL('./fixtures/research-plan/', import.meta.url);

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function dependency({
  name,
  normalizedName = name,
  declaredVersion = null,
  type = 'runtime',
  manifest
}) {
  return { name, normalizedName, declaredVersion, type, manifest };
}

function project({ id, path: projectPath, ecosystem, dependencies = [] }) {
  const manifests = ecosystem === 'node'
    ? [`${projectPath === '.' ? '' : `${projectPath}/`}package.json`]
    : [`${projectPath === '.' ? '' : `${projectPath}/`}requirements.txt`];
  const uniqueCount = new Set(dependencies.map((item) => item.normalizedName)).size;
  const dependencySummary = {
    status: 'parsed',
    declarationCount: dependencies.length,
    uniqueCount,
    duplicateCount: dependencies.length - uniqueCount
  };
  if (ecosystem === 'node') {
    dependencySummary.byType = {
      dependencies: dependencies.filter((item) => item.type === 'dependency').length,
      devDependencies: dependencies.filter((item) => item.type === 'devDependency').length,
      peerDependencies: dependencies.filter((item) => item.type === 'peerDependency').length,
      optionalDependencies: dependencies.filter((item) => item.type === 'optionalDependency').length
    };
  }
  return {
    id,
    name: id.split(':')[1] || ecosystem,
    path: projectPath,
    ecosystem,
    languages: [ecosystem === 'python' ? 'Python' : ecosystem === 'java' ? 'Java' : 'JavaScript'],
    manifests,
    dependencySummary,
    dependencies
  };
}

function manifest(projects, repositoryName = 'research-plan-fixture') {
  const ecosystems = {};
  for (const item of projects) ecosystems[item.ecosystem] = (ecosystems[item.ecosystem] ?? 0) + 1;
  return {
    schemaVersion: '2.0.0',
    generatedAt: '2026-07-14T00:00:00.000Z',
    generator: { name: 'UpgradeLens', version: '0.1.1' },
    repository: { name: repositoryName, root: '.' },
    summary: { projectCount: projects.length, ecosystems, workspaceCount: 0 },
    projects,
    warnings: []
  };
}

async function load(value, artifact = '.upgradelens/project-manifest.json') {
  const bytes = Buffer.from(JSON.stringify(value));
  return loadProjectManifestInput({ bytes, artifact });
}

async function planFor(value) {
  return createResearchPlan(await load(value));
}

test('loads an empty Project Manifest fixture into an empty deterministic Research Plan', async () => {
  const bytes = await readFile(new URL('empty-project-manifest.json', fixtureDirectory));
  const loaded = await loadProjectManifestInput({
    bytes,
    artifact: '.upgradelens/project-manifest.json'
  });
  const plan = createResearchPlan(loaded);

  assert.equal(loaded.input.projectManifest.artifactDigest, digest(bytes));
  assert.deepEqual(plan.summary, {
    inputProjectCount: 0,
    inputOccurrenceCount: 0,
    researchableOccurrenceCount: 0,
    uniqueResearchPackageCount: 0,
    invalidOccurrenceCount: 0,
    unsupportedOccurrenceCount: 0
  });
  assert.deepEqual(plan.packages, []);
  assert.deepEqual(plan.warnings, []);
});

test('plans Node React/Vite and Python FastAPI from a Project Manifest fixture', async () => {
  const bytes = await readFile(new URL('node-python-project-manifest.json', fixtureDirectory));
  const plan = createResearchPlan(await loadProjectManifestInput({
    bytes,
    artifact: '.upgradelens/project-manifest.json'
  }));

  assert.deepEqual(plan.packages.map((item) => item.id), [
    'npm:react',
    'npm:vite',
    'pypi:fastapi'
  ]);
  assert.equal(plan.summary.inputOccurrenceCount, 3);
  assert.equal(plan.summary.researchableOccurrenceCount, 3);
});

test('VinGrade-like Node and Python dependencies produce 47 researchable occurrences and 46 packages', async () => {
  const nodeNames = [
    'react', 'react-dom', 'react-router-dom', 'axios', 'clsx', 'lucide-react',
    'tailwind-merge', 'zod', 'zustand', '@eslint/js', '@types/node', '@types/react',
    '@types/react-dom', '@vitejs/plugin-react', 'eslint', 'eslint-plugin-react-hooks',
    'eslint-plugin-react-refresh', 'typescript', 'vite'
  ];
  const pythonNames = [
    'flask', 'Django', 'requests', 'urllib3', 'fastapi', 'pydantic', 'sqlalchemy', 'alembic',
    'packaging', 'uvicorn', 'colorama', 'httpx', 'pytest', 'pytest-cov', 'ruff', 'mypy',
    'celery', 'redis', 'boto3', 'numpy', 'pandas', 'scipy', 'Pillow', 'cryptography',
    'python-dotenv', 'orjson', 'langchain-openai', 'LangChain_OpenAI'
  ];
  const nodeDependencies = nodeNames.map((name, index) => dependency({
    name,
    declaredVersion: '^1.0.0',
    type: index < 9 ? 'dependency' : 'devDependency',
    manifest: 'FE/package.json'
  }));
  const pythonDependencies = pythonNames.map((name) => dependency({
    name,
    normalizedName: name.toLowerCase().replace(/[-_.]+/g, '-'),
    declaredVersion: '>=1.0.0',
    manifest: 'requirements.txt'
  }));
  const plan = await planFor(manifest([
    project({ id: 'node:FE', path: 'FE', ecosystem: 'node', dependencies: nodeDependencies }),
    project({ id: 'python:.', path: '.', ecosystem: 'python', dependencies: pythonDependencies })
  ], 'vingrade-like'));

  assert.deepEqual(plan.summary, {
    inputProjectCount: 2,
    inputOccurrenceCount: 47,
    researchableOccurrenceCount: 47,
    uniqueResearchPackageCount: 46,
    invalidOccurrenceCount: 0,
    unsupportedOccurrenceCount: 0
  });
  const duplicate = plan.packages.find((item) => item.id === 'pypi:langchain-openai');
  assert.equal(duplicate.occurrences.length, 2);
  assert.deepEqual(duplicate.observedDeclaredNames, ['LangChain_OpenAI', 'langchain-openai']);
});

test('groups duplicate Python declarations and the same npm package across projects without losing occurrences', async () => {
  const python = project({
    id: 'python:.', path: '.', ecosystem: 'python', dependencies: [
      dependency({ name: 'LangChain_OpenAI', normalizedName: 'langchain-openai', declaredVersion: '==1.0', manifest: 'requirements.txt' }),
      dependency({ name: 'langchain-openai', normalizedName: 'langchain-openai', declaredVersion: '>=1.1', manifest: 'requirements.txt' })
    ]
  });
  const web = project({
    id: 'node:apps/web', path: 'apps/web', ecosystem: 'node', dependencies: [
      dependency({ name: 'react', declaredVersion: '^19.0.0', type: 'dependency', manifest: 'apps/web/package.json' })
    ]
  });
  const admin = project({
    id: 'node:apps/admin', path: 'apps/admin', ecosystem: 'node', dependencies: [
      dependency({ name: 'react', declaredVersion: '^19.2.0', type: 'dependency', manifest: 'apps/admin/package.json' })
    ]
  });
  const plan = await planFor(manifest([python, web, admin]));

  assert.equal(plan.packages.find((item) => item.id === 'pypi:langchain-openai').occurrences.length, 2);
  const react = plan.packages.find((item) => item.id === 'npm:react');
  assert.equal(react.occurrences.length, 2);
  assert.deepEqual(react.occurrences.map((item) => item.projectId), ['node:apps/admin', 'node:apps/web']);
});

test('accepts scoped npm packages, unversioned Python packages, and named Python direct references', async () => {
  const plan = await planFor(manifest([
    project({
      id: 'node:.', path: '.', ecosystem: 'node', dependencies: [
        dependency({ name: '@vitejs/plugin-react', declaredVersion: '^5.0.0', type: 'devDependency', manifest: 'package.json' })
      ]
    }),
    project({
      id: 'python:.', path: '.', ecosystem: 'python', dependencies: [
        dependency({ name: 'flask', declaredVersion: null, manifest: 'requirements.txt' }),
        dependency({
          name: 'example-package',
          normalizedName: 'example-package',
          declaredVersion: 'https://user:secret@example.com/example-package.whl?token=secret',
          type: 'directReference',
          manifest: 'requirements.txt'
        })
      ]
    })
  ]));

  assert.deepEqual(plan.packages.map((item) => item.id), [
    'npm:@vitejs/plugin-react',
    'pypi:example-package',
    'pypi:flask'
  ]);
  const flask = plan.packages.find((item) => item.id === 'pypi:flask');
  assert.equal(flask.occurrences[0].declaredVersion, null);
  const direct = plan.packages.find((item) => item.id === 'pypi:example-package');
  assert.equal(direct.occurrences[0].declaredVersion, 'https://example.com/example-package.whl');
  assert.doesNotMatch(JSON.stringify(plan), /secret|token=/);
});

test('classifies unnamed URL, unnamed Git, and local editable references as invalid', async () => {
  const plan = await planFor(manifest([
    project({
      id: 'python:.', path: '.', ecosystem: 'python', dependencies: [
        dependency({
          name: 'https://user:secret@example.com/package.whl?token=secret',
          normalizedName: 'https://user:secret@example.com/package.whl?token=secret',
          declaredVersion: 'https://user:secret@example.com/package.whl?token=secret',
          type: 'directReference',
          manifest: 'requirements.txt'
        }),
        dependency({
          name: 'git+https://user:secret@example.com/owner/repo.git',
          normalizedName: 'git+https://user:secret@example.com/owner/repo.git',
          declaredVersion: 'git+https://user:secret@example.com/owner/repo.git',
          type: 'directReference',
          manifest: 'requirements.txt'
        }),
        dependency({
          name: '.', normalizedName: '.', declaredVersion: '.', type: 'editable', manifest: 'requirements.txt'
        })
      ]
    })
  ]));

  assert.equal(plan.summary.invalidOccurrenceCount, 3);
  assert.deepEqual(plan.invalidOccurrences.map((item) => item.reason), [
    'unnamed-direct-reference',
    'unnamed-direct-reference',
    'local-path-reference'
  ]);
  assert.ok(plan.warnings.every((warning) => warning.code === 'INVALID_PACKAGE_REFERENCE'));
  assert.doesNotMatch(JSON.stringify(plan), /secret|token=/);
});

test('aggregates unsupported ecosystem dependencies without inventing invalid package references', async () => {
  const plan = await planFor(manifest([
    project({
      id: 'java:backend', path: 'backend', ecosystem: 'java', dependencies: [
        dependency({ name: 'spring-core', declaredVersion: '6.0.0', type: 'runtime', manifest: 'backend/pom.xml' }),
        dependency({ name: 'jackson', declaredVersion: '2.0.0', type: 'runtime', manifest: 'backend/pom.xml' })
      ]
    })
  ]));

  assert.deepEqual(plan.unsupported, [{
    ecosystem: 'java', projectIds: ['java:backend'], occurrenceCount: 2
  }]);
  assert.equal(plan.summary.unsupportedOccurrenceCount, 2);
  assert.equal(plan.summary.invalidOccurrenceCount, 0);
  assert.deepEqual(plan.warnings.map((warning) => warning.code), ['UNSUPPORTED_RESEARCH_ECOSYSTEM']);
});

test('rejects absolute artifacts, invalid JSON, unsupported Project Manifest versions, and schema-invalid manifests', async (t) => {
  const emptyBytes = await readFile(new URL('empty-project-manifest.json', fixtureDirectory));
  await assert.rejects(
    loadProjectManifestInput({ bytes: emptyBytes, artifact: '/tmp/project-manifest.json' }),
    /artifact must be a portable repository-relative path/
  );

  const invalidPath = new URL('invalid-project-manifest.json', fixtureDirectory);
  await assert.rejects(loadProjectManifestInput(invalidPath), /not valid JSON/);

  const oldVersion = manifest([]);
  oldVersion.schemaVersion = '1.0.0';
  await assert.rejects(load(oldVersion), /unsupported schema version/);

  const schemaInvalid = manifest([]);
  delete schemaInvalid.generator;
  await assert.rejects(load(schemaInvalid), /schema validation failed/);

  const temporary = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-plan-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const target = path.join(temporary, 'project-manifest.json');
  await writeFile(target, emptyBytes);
  const loaded = await loadProjectManifestInput(target);
  assert.equal(loaded.input.projectManifest.artifact, '.upgradelens/project-manifest.json');
});

test('rejects Project Manifest dependency runtime invariant failures', async () => {
  const invalid = manifest([
    project({
      id: 'node:.', path: '.', ecosystem: 'node', dependencies: [
        dependency({ name: 'react', declaredVersion: '^19.0.0', type: 'dependency', manifest: 'package.json' })
      ]
    })
  ]);
  invalid.projects[0].dependencySummary.uniqueCount = 2;

  await assert.rejects(load(invalid), /runtime invariants failed/);
});

test('uses exact input bytes for lineage digests and never hashes reserialized JSON', async () => {
  const value = manifest([]);
  const compact = Buffer.from(JSON.stringify(value));
  const formatted = Buffer.from(JSON.stringify(value, null, 2));
  const first = await loadProjectManifestInput({ bytes: compact, artifact: '.upgradelens/project-manifest.json' });
  const second = await loadProjectManifestInput({ bytes: formatted, artifact: '.upgradelens/project-manifest.json' });

  assert.equal(first.input.projectManifest.artifactDigest, digest(compact));
  assert.equal(second.input.projectManifest.artifactDigest, digest(formatted));
  assert.notEqual(first.input.projectManifest.artifactDigest, second.input.projectManifest.artifactDigest);
  assert.deepEqual(first.manifest, second.manifest);
});

test('canonicalizes Research Plans independently of Project Manifest project and dependency order', async () => {
  const node = project({
    id: 'node:web', path: 'web', ecosystem: 'node', dependencies: [
      dependency({ name: 'vite', declaredVersion: '^7.0.0', type: 'devDependency', manifest: 'web/package.json' }),
      dependency({ name: 'react', declaredVersion: '^19.2.0', type: 'dependency', manifest: 'web/package.json' })
    ]
  });
  const python = project({
    id: 'python:api', path: 'api', ecosystem: 'python', dependencies: [
      dependency({ name: 'FastAPI', normalizedName: 'fastapi', declaredVersion: '==0.116.0', manifest: 'api/requirements.txt' }),
      dependency({ name: 'requests', declaredVersion: '>=2.0.0', manifest: 'api/requirements.txt' })
    ]
  });
  const first = await planFor(manifest([node, python]));
  const second = await planFor(manifest([
    { ...python, dependencies: [...python.dependencies].reverse() },
    { ...node, dependencies: [...node.dependencies].reverse() }
  ]));

  assert.notEqual(first.input.projectManifest.artifactDigest, second.input.projectManifest.artifactDigest);
  assert.deepEqual(first.summary, second.summary);
  assert.deepEqual(first.packages, second.packages);
  assert.deepEqual(first.invalidOccurrences, second.invalidOccurrences);
  assert.deepEqual(first.unsupported, second.unsupported);
  assert.deepEqual(first.warnings, second.warnings);
});

test('Research Plan runtime validation fails fast for internal count, identity, ordering, and warning bugs', async () => {
  const plan = await planFor(manifest([
    project({
      id: 'node:.', path: '.', ecosystem: 'node', dependencies: [
        dependency({ name: 'react', declaredVersion: '^19.0.0', type: 'dependency', manifest: 'package.json' }),
        dependency({ name: 'vite', declaredVersion: '^7.0.0', type: 'devDependency', manifest: 'package.json' })
      ]
    })
  ]));

  const countFailure = structuredClone(plan);
  countFailure.summary.uniqueResearchPackageCount = 1;
  assert.throws(() => validateResearchPlan(countFailure), /uniqueResearchPackageCount/);

  const identityFailure = structuredClone(plan);
  identityFailure.packages[0].id = 'npm:not-react';
  assert.throws(() => validateResearchPlan(identityFailure), /does not match its identity/);

  const orderingFailure = structuredClone(plan);
  orderingFailure.packages.reverse();
  assert.throws(() => validateResearchPlan(orderingFailure), /packages must be sorted/);

  const warningFailure = structuredClone(plan);
  warningFailure.warnings.push({
    code: 'INVALID_PACKAGE_REFERENCE',
    projectId: 'node:.',
    manifest: 'package.json',
    dependencyType: 'dependency',
    declaredName: 'missing',
    declaredVersion: null,
    message: 'Invalid.'
  });
  assert.throws(() => validateResearchPlan(warningFailure), /warning/);
});
