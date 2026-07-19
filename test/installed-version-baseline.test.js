import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { discoverProject } from '../src/index.js';

async function temporaryProject(t, name) {
  const root = await mkdtemp(path.join(os.tmpdir(), `upgradelens-${name}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function write(root, relative, contents) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, typeof contents === 'string' ? contents : JSON.stringify(contents));
}

function dependency(project, name, type = 'dependency') {
  return project.dependencies.find((item) => item.name === name && item.type === type);
}

test('resolves npm lockfile v3 root, scoped, and unresolved occurrences without guessing', async (t) => {
  const root = await temporaryProject(t, 'baseline-v3');
  await write(root, 'package.json', {
    name: 'baseline-v3',
    dependencies: {
      react: '^19.2.6',
      '@scope/pkg': '^2.0.0',
      missing: '^1.0.0',
      'no-version': '^1.0.0',
      local: 'file:../local'
    }
  });
  await write(root, 'package-lock.json', {
    name: 'baseline-v3',
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { react: '^19.2.6' } },
      'node_modules/react': { version: '19.2.7' },
      'node_modules/@scope/pkg': { version: '2.1.0' },
      'node_modules/no-version': {}
    }
  });

  const manifest = await discoverProject(root);
  const project = manifest.projects[0];
  const react = dependency(project, 'react');
  const scoped = dependency(project, '@scope/pkg');

  assert.equal(react.declaredVersion, '^19.2.6');
  assert.equal(react.installedVersion, '19.2.7');
  assert.equal(react.installedVersionStatus, 'resolved');
  assert.equal(react.installedVersionReason, null);
  assert.deepEqual(react.installedVersionSource, {
    type: 'package-lock',
    path: 'package-lock.json',
    lockfileVersion: 3,
    packagePath: 'node_modules/react'
  });
  assert.equal(scoped.installedVersion, '2.1.0');
  assert.equal(scoped.installedVersionSource.packagePath, 'node_modules/@scope/pkg');
  assert.equal(dependency(project, 'missing').installedVersionReason, 'PACKAGE_NOT_RESOLVED');
  assert.equal(dependency(project, 'no-version').installedVersionReason, 'RESOLVED_VERSION_UNAVAILABLE');
  assert.equal(dependency(project, 'local').installedVersionReason, 'NON_REGISTRY_DEPENDENCY');
  assert.ok(project.dependencies.every((item) =>
    item.installedVersionSource === null
    || (!path.isAbsolute(item.installedVersionSource.path)
      && !path.isAbsolute(item.installedVersionSource.packagePath))
  ));
});

test('supports npm lockfile v2 and retains small v1 root compatibility', async (t) => {
  const v2Root = await temporaryProject(t, 'baseline-v2');
  await write(v2Root, 'package.json', {
    name: 'baseline-v2',
    dependencies: { react: '^18.0.0' }
  });
  await write(v2Root, 'package-lock.json', {
    name: 'baseline-v2',
    lockfileVersion: 2,
    packages: {
      '': {},
      'node_modules/react': { version: '18.3.1' }
    }
  });
  const v2 = await discoverProject(v2Root);
  assert.equal(v2.projects[0].dependencies[0].installedVersion, '18.3.1');
  assert.equal(v2.projects[0].dependencies[0].installedVersionSource.lockfileVersion, 2);

  const v1Root = await temporaryProject(t, 'baseline-v1');
  await write(v1Root, 'package.json', {
    name: 'baseline-v1',
    dependencies: { react: '^17.0.0' }
  });
  await write(v1Root, 'package-lock.json', {
    name: 'baseline-v1',
    lockfileVersion: 1,
    dependencies: { react: { version: '17.0.2' } }
  });
  const v1 = await discoverProject(v1Root);
  assert.equal(v1.projects[0].dependencies[0].installedVersion, '17.0.2');
  assert.equal(v1.projects[0].dependencies[0].installedVersionSource.lockfileVersion, 1);
});

test('fails safely for missing, invalid, and unsupported npm lockfiles', async (t) => {
  const cases = [
    {
      name: 'missing',
      lockfile: null,
      reason: 'LOCKFILE_NOT_FOUND'
    },
    {
      name: 'invalid',
      lockfile: '{ invalid json',
      reason: 'INVALID_LOCKFILE'
    },
    {
      name: 'unsupported',
      lockfile: { lockfileVersion: 4, packages: {} },
      reason: 'LOCKFILE_UNSUPPORTED'
    }
  ];

  for (const fixture of cases) {
    const root = await temporaryProject(t, `baseline-${fixture.name}`);
    await write(root, 'package.json', {
      name: fixture.name,
      dependencies: { react: '^19.0.0' }
    });
    if (fixture.lockfile !== null) {
      await write(root, 'package-lock.json', fixture.lockfile);
    }
    const manifest = await discoverProject(root);
    const react = manifest.projects[0].dependencies[0];
    assert.equal(react.installedVersion, null);
    assert.equal(react.installedVersionStatus, 'unresolved');
    assert.equal(react.installedVersionSource, null);
    assert.equal(react.installedVersionReason, fixture.reason);
  }
});

test('reports pnpm and Yarn lockfiles as unsupported instead of parsing them heuristically', async (t) => {
  const fixtures = [
    {
      name: 'pnpm',
      packageManager: 'pnpm@10.0.0',
      lockfile: 'pnpm-lock.yaml',
      contents: "lockfileVersion: '9.0'\n"
    },
    {
      name: 'yarn',
      packageManager: undefined,
      lockfile: 'yarn.lock',
      contents: 'react@^19.0.0:\n  version "19.2.7"\n'
    }
  ];
  for (const fixture of fixtures) {
    const root = await temporaryProject(t, `baseline-${fixture.name}`);
    await write(root, 'package.json', {
      name: fixture.name,
      ...(fixture.packageManager ? { packageManager: fixture.packageManager } : {}),
      dependencies: { react: '^19.0.0' }
    });
    await write(root, fixture.lockfile, fixture.contents);

    const manifest = await discoverProject(root);
    const react = manifest.projects[0].dependencies[0];
    assert.equal(manifest.projects[0].packageManager.name, fixture.name);
    assert.equal(react.installedVersion, null);
    assert.equal(react.installedVersionReason, 'LOCKFILE_UNSUPPORTED');
  }
});

test('resolves the same package independently across projects and never selects the highest version', async (t) => {
  const root = await temporaryProject(t, 'baseline-projects');
  await write(root, 'apps/a/package.json', {
    name: 'a',
    dependencies: { react: '^18.0.0' }
  });
  await write(root, 'apps/a/package-lock.json', {
    name: 'a',
    lockfileVersion: 3,
    packages: { '': {}, 'node_modules/react': { version: '18.3.1' } }
  });
  await write(root, 'apps/b/package.json', {
    name: 'b',
    dependencies: { react: '^19.0.0' }
  });
  await write(root, 'apps/b/package-lock.json', {
    name: 'b',
    lockfileVersion: 3,
    packages: { '': {}, 'node_modules/react': { version: '19.2.7' } }
  });

  const manifest = await discoverProject(root);
  const byId = new Map(manifest.projects.map((project) => [project.id, project]));
  const first = dependency(byId.get('node:apps/a'), 'react');
  const second = dependency(byId.get('node:apps/b'), 'react');

  assert.equal(first.declaredVersion, '^18.0.0');
  assert.equal(first.installedVersion, '18.3.1');
  assert.equal(first.installedVersionSource.path, 'apps/a/package-lock.json');
  assert.equal(second.declaredVersion, '^19.0.0');
  assert.equal(second.installedVersion, '19.2.7');
  assert.equal(second.installedVersionSource.path, 'apps/b/package-lock.json');
});

test('uses npm workspace ownership and preserves dependency-type occurrence identity', async (t) => {
  const root = await temporaryProject(t, 'baseline-workspace');
  await write(root, 'package.json', {
    name: 'workspace',
    private: true,
    workspaces: ['apps/*'],
    dependencies: { lodash: '^4.17.0' }
  });
  await write(root, 'apps/a/package.json', {
    name: 'a',
    dependencies: { react: '^18.0.0', lodash: '^4.17.0' },
    devDependencies: { react: '~18.3.0' }
  });
  await write(root, 'apps/a/package-lock.json', {
    name: 'stale-member-lockfile',
    lockfileVersion: 3,
    packages: {
      '': {},
      'node_modules/react': { version: '99.0.0' }
    }
  });
  await write(root, 'apps/b/package.json', {
    name: 'b',
    dependencies: { react: '^19.0.0', lodash: '^4.17.0' }
  });
  await write(root, 'package-lock.json', {
    name: 'workspace',
    lockfileVersion: 3,
    packages: {
      '': {},
      'apps/a': {},
      'apps/b': {},
      'node_modules/lodash': { version: '4.17.21' },
      'apps/a/node_modules/react': { version: '18.3.1' },
      'apps/b/node_modules/react': { version: '19.2.7' }
    }
  });

  const manifest = await discoverProject(root);
  const byId = new Map(manifest.projects.map((project) => [project.id, project]));
  const appA = byId.get('node:apps/a');
  const appB = byId.get('node:apps/b');
  const appAReact = appA.dependencies.filter((item) => item.name === 'react');

  assert.deepEqual(appA.workspace, { root: '.', role: 'member' });
  assert.deepEqual(appB.workspace, { root: '.', role: 'member' });
  assert.deepEqual(appAReact.map((item) => item.type), ['dependency', 'devDependency']);
  assert.deepEqual(appAReact.map((item) => item.declaredVersion), ['^18.0.0', '~18.3.0']);
  assert.deepEqual(appAReact.map((item) => item.installedVersion), ['18.3.1', '18.3.1']);
  assert.deepEqual(appAReact.map((item) => item.installedVersionSource.packagePath), [
    'apps/a/node_modules/react',
    'apps/a/node_modules/react'
  ]);
  assert.equal(dependency(appB, 'react').installedVersion, '19.2.7');
  assert.equal(dependency(appA, 'lodash').installedVersion, '4.17.21');
  assert.equal(dependency(appB, 'lodash').installedVersion, '4.17.21');
});

test('does not choose another workspace occurrence when package resolution is ambiguous', async (t) => {
  const root = await temporaryProject(t, 'baseline-workspace-ambiguous');
  await write(root, 'package.json', {
    name: 'workspace',
    private: true,
    workspaces: ['apps/*']
  });
  await write(root, 'apps/a/package.json', {
    name: 'a',
    dependencies: { react: '^19.0.0' }
  });
  await write(root, 'package-lock.json', {
    name: 'workspace',
    lockfileVersion: 3,
    packages: {
      '': {},
      'apps/a': {},
      'apps/b/node_modules/react': { version: '18.3.1' },
      'apps/c/node_modules/react': { version: '19.2.7' }
    }
  });

  const manifest = await discoverProject(root);
  const react = dependency(
    manifest.projects.find((project) => project.id === 'node:apps/a'),
    'react'
  );
  assert.equal(react.installedVersion, null);
  assert.equal(react.installedVersionReason, 'WORKSPACE_RESOLUTION_AMBIGUOUS');
});

test('does not assign a Node lockfile baseline to Python dependencies', async (t) => {
  const root = await temporaryProject(t, 'baseline-polyglot');
  await write(root, 'package.json', {
    name: 'frontend',
    dependencies: { react: '^19.0.0' }
  });
  await write(root, 'package-lock.json', {
    name: 'frontend',
    lockfileVersion: 3,
    packages: { '': {}, 'node_modules/react': { version: '19.2.7' } }
  });
  await write(root, 'api/requirements.txt', 'react==99.0.0\n');

  const manifest = await discoverProject(root);
  const nodeDependency = dependency(
    manifest.projects.find((project) => project.id === 'node:.'),
    'react'
  );
  const pythonDependency = dependency(
    manifest.projects.find((project) => project.id === 'python:api'),
    'react',
    'runtime'
  );

  assert.equal(nodeDependency.installedVersion, '19.2.7');
  assert.equal(pythonDependency.declaredVersion, '==99.0.0');
  assert.equal(pythonDependency.installedVersion, null);
  assert.equal(pythonDependency.installedVersionReason, 'RESOLVED_VERSION_UNAVAILABLE');
});
