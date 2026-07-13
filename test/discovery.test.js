import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_OUTPUT_DIRECTORY,
  MANIFEST_SCHEMA_VERSION,
  PACKAGE_NAME,
  PRODUCT_NAME,
  discoverProject
} from '../src/index.js';

const temporaryDirectories = [];

async function temporaryProject(name = 'sample') {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-'));
  const root = path.join(parent, name);
  await mkdir(root);
  temporaryDirectories.push(parent);
  return root;
}

async function write(root, relative, contents) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}

test.after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

test('exports the required product conventions', () => {
  assert.equal(PRODUCT_NAME, 'UpgradeLens');
  assert.equal(PACKAGE_NAME, 'upgradelens');
  assert.equal(DEFAULT_OUTPUT_DIRECTORY, '.upgradelens');
  assert.equal(DEFAULT_MANIFEST_PATH, '.upgradelens/project-manifest.json');
  assert.equal(MANIFEST_SCHEMA_VERSION, '2.0.0');
});

test('discovers a polyglot repository and Node workspace members', async () => {
  const root = await temporaryProject('polyglot');
  await write(root, 'package.json', JSON.stringify({
    name: 'workspace-root',
    private: true,
    packageManager: 'pnpm@10.0.0'
  }));
  await write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n  - '!packages/ignored'\n");
  await write(root, 'packages/web/package.json', JSON.stringify({
    name: '@example/web',
    version: '1.2.3',
    dependencies: { react: '^19.0.0' },
    devDependencies: { react: '^19.0.0', vite: '^7.0.0' }
  }));
  await write(root, 'services/api/pyproject.toml', '[project]\nname = "example-api"\n');
  await write(root, 'business-central/app.json', JSON.stringify({
    id: '6e3c753c-e7f6-4f48-b8f6-b4ee911c78f8',
    name: 'Example AL App',
    publisher: 'Example',
    version: '1.0.0.0',
    dependencies: [{ id: 'dependency' }]
  }));
  await write(root, 'node_modules/ignored/package.json', '{"name":"ignored"}');
  await write(root, 'packages/ignored/package.json', '{"name":"workspace-excluded"}');

  const manifest = await discoverProject(root, { clock: () => new Date('2026-01-02T03:04:05.000Z') });

  assert.equal(manifest.generatedAt, '2026-01-02T03:04:05.000Z');
  assert.deepEqual(manifest.summary, {
    projectCount: 5,
    ecosystems: { al: 1, node: 3, python: 1 },
    workspaceCount: 1
  });
  assert.deepEqual(manifest.projects.map((project) => project.id), [
    'al:business-central',
    'node:.',
    'node:packages/ignored',
    'node:packages/web',
    'python:services/api'
  ]);
  assert.deepEqual(
    manifest.projects.find((project) => project.id === 'node:.').workspace,
    { root: '.', role: 'root' }
  );
  assert.deepEqual(
    manifest.projects.find((project) => project.id === 'node:packages/web').workspace,
    { root: '.', role: 'member' }
  );
  assert.deepEqual(
    manifest.projects.find((project) => project.id === 'node:packages/web').packageManager,
    { name: 'pnpm', version: '10.0.0' }
  );
  assert.equal(manifest.projects.find((project) => project.id === 'node:packages/ignored').workspace, undefined);
  assert.deepEqual(
    manifest.projects.find((project) => project.id === 'node:packages/web').dependencySummary,
    {
      status: 'parsed',
      declarationCount: 3,
      uniqueCount: 2,
      duplicateCount: 1,
      byType: {
        dependencies: 1,
        devDependencies: 2,
        peerDependencies: 0,
        optionalDependencies: 0
      }
    }
  );
  assert.deepEqual(
    manifest.projects.find((project) => project.id === 'python:services/api').dependencySummary,
    { status: 'unsupported' }
  );
  assert.equal(manifest.projects.find((project) => project.id === 'python:services/api').dependencies.length, 0);
  assert.deepEqual(
    manifest.projects.find((project) => project.id === 'al:business-central').dependencySummary,
    { status: 'unsupported' }
  );
  assert.equal(manifest.projects.find((project) => project.id === 'al:business-central').dependencies.length, 0);
  assert.deepEqual(manifest.warnings, [{
    code: 'DUPLICATE_DEPENDENCY_DECLARATION',
    path: 'packages/web/package.json',
    message: 'Dependency react is declared multiple times.'
  }]);
});

test('records malformed JSON as a warning and continues discovery', async () => {
  const root = await temporaryProject('invalid-manifest');
  await write(root, 'package.json', '{ invalid json');
  await write(root, 'module/go.mod', 'module example.com/module\n');

  const manifest = await discoverProject(root);

  assert.equal(manifest.summary.projectCount, 1);
  assert.equal(manifest.projects[0].id, 'go:module');
  assert.equal(manifest.warnings.length, 1);
  assert.equal(manifest.warnings[0].code, 'MANIFEST_INVALID');
  assert.equal(manifest.warnings[0].path, 'package.json');
});

test('respects the maximum scan depth', async () => {
  const root = await temporaryProject('depth');
  await write(root, 'package.json', '{"name":"root"}');
  await write(root, 'nested/package.json', '{"name":"nested"}');

  const manifest = await discoverProject(root, { maxDepth: 0 });

  assert.deepEqual(manifest.projects.map((project) => project.id), ['node:.']);
});

test('rejects missing roots and file roots with actionable errors', async () => {
  const root = await temporaryProject('bad-root');
  await write(root, 'file.txt', 'content');

  await assert.rejects(discoverProject(path.join(root, 'missing')), /Cannot access project root/);
  await assert.rejects(discoverProject(path.join(root, 'file.txt')), /not a directory/);
});
