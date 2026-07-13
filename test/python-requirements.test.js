import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { discoverProject } from '../src/index.js';
import { parseRequirementsTxt } from '../src/python-requirements.js';

const VINGRADE_REQUIREMENTS = [
  'flask',
  'Django==5.2.1',
  'requests>=2.32.0',
  'urllib3<=2.5.0',
  'fastapi~=0.116.0',
  'pydantic!=2.10.0',
  'sqlalchemy>2.0.0',
  'alembic<2.0.0',
  'packaging===25.0',
  'uvicorn[standard]==0.35.0',
  'colorama; sys_platform == "win32"',
  'httpx>=0.27,<1.0',
  'pytest==8.4.1',
  'pytest-cov>=6.0.0',
  'ruff==0.12.0',
  'mypy>=1.16.0',
  'celery==5.5.3',
  'redis>=6.0.0',
  'boto3==1.39.0',
  'numpy>=2.0.0',
  'pandas==2.3.0',
  'scipy<=1.16.0',
  'Pillow>=11.0.0',
  'cryptography==45.0.0',
  'python-dotenv~=1.1.0',
  'orjson!=3.10.0',
  'langchain-openai==0.3.0',
  'LangChain_OpenAI>=0.3.0'
];

async function temporaryProject(t, prefix = 'upgradelens-dependencies-') {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function projectWithRequirements(t, contents, manifest = 'requirements.txt') {
  const root = await temporaryProject(t, 'upgradelens-python-');
  const file = path.join(root, manifest);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  return root;
}

test('Python reports 28 declarations, 27 unique packages, and one duplicate', async (t) => {
  const root = await projectWithRequirements(t, `${VINGRADE_REQUIREMENTS.join('\n')}\n`);

  const manifest = await discoverProject(root);
  const python = manifest.projects.find((project) => project.ecosystem === 'python');

  assert.deepEqual(python.dependencySummary, {
    status: 'parsed',
    declarationCount: 28,
    uniqueCount: 27,
    duplicateCount: 1
  });
  assert.equal(python.dependencies.length, 28);
  assert.deepEqual(manifest.warnings, [{
    code: 'DUPLICATE_DEPENDENCY_DECLARATION',
    path: 'requirements.txt',
    message: 'Dependency langchain-openai is declared multiple times.'
  }]);
});

test('ignores blank lines, comments, includes, constraints, and index options', () => {
  const parsed = parseRequirementsTxt(`
    # heading
    -r base.txt
    --requirement=development.txt
    -c constraints.txt
    --constraint=production.txt
    --index-url https://pypi.example/simple
    --extra-index-url=https://mirror.example/simple
    requests==2.32.0  # pinned for compatibility

    urllib3>=2 # another comment
  `);

  assert.deepEqual(parsed.dependencySummary, {
    status: 'parsed', declarationCount: 2, uniqueCount: 2, duplicateCount: 0
  });
  assert.deepEqual(parsed.issues, []);
});

test('accepts extras, environment markers, and every supported specifier', () => {
  const parsed = parseRequirementsTxt(`
    uvicorn[standard]==1.0.0
    importlib-metadata>=8; python_version < "3.10"
    alpha<=2
    bravo~=3
    charlie!=4
    delta>5
    echo<6
    foxtrot===7
  `);

  assert.equal(parsed.dependencySummary.declarationCount, 8);
  assert.deepEqual(parsed.issues, []);
});

test('deduplicates Python names across case, underscore, hyphen, and dot variants', () => {
  const parsed = parseRequirementsTxt(`
    My_Package==1.0
    my-package>=1.0
    my.package[extra]
    MY__PACKAGE~=2.0
  `);

  assert.deepEqual(parsed.dependencySummary, {
    status: 'parsed', declarationCount: 4, uniqueCount: 1, duplicateCount: 3
  });
  assert.deepEqual(parsed.duplicateNames, ['my-package']);
  assert.ok(parsed.dependencies.every((dependency) => dependency.normalizedName === 'my-package'));
});

test('keeps editable, URL, and Git declarations without crashing', () => {
  const parsed = parseRequirementsTxt(`
    -e git+https://github.com/example/repo.git#egg=Git_Dependency
    direct-package @ https://example.com/direct-package.whl ; python_version >= "3.10"
    https://example.com/unnamed-package.whl
    git+https://github.com/example/unnamed.git
    -e .
  `);

  assert.equal(parsed.dependencySummary.declarationCount, 5);
  assert.equal(parsed.dependencies.filter((dependency) => dependency.type === 'editable').length, 2);
  assert.equal(parsed.dependencies.filter((dependency) => dependency.type === 'directReference').length, 3);
  assert.deepEqual(parsed.issues, []);
});

test('failed Python parsing emits no partial counts or inventory', async (t) => {
  const root = await projectWithRequirements(t, 'requests==2.32.0\nnot a valid requirement ???\n');

  const manifest = await discoverProject(root);
  const python = manifest.projects.find((project) => project.ecosystem === 'python');

  assert.deepEqual(python.dependencySummary, { status: 'failed' });
  assert.equal(python.dependencies.length, 0);
  assert.equal('declarationCount' in python.dependencySummary, false);
  assert.equal(manifest.warnings[0].code, 'DEPENDENCY_PARSE_FAILED');
});

test('unsupported parser emits no counts or inventory', async (t) => {
  const root = await temporaryProject(t, 'upgradelens-pyproject-');
  await writeFile(path.join(root, 'pyproject.toml'), '[project]\nname = "pyproject-only"\n');

  const manifest = await discoverProject(root);

  assert.deepEqual(manifest.projects[0].dependencySummary, { status: 'unsupported' });
  assert.equal(manifest.projects[0].dependencies.length, 0);
  assert.equal('uniqueCount' in manifest.projects[0].dependencySummary, false);
});

test('Node VinGrade fixture reports 9 runtime and 10 development dependencies', async (t) => {
  const root = await temporaryProject(t, 'upgradelens-node-vingrade-');
  const dependencies = Object.fromEntries([
    'react', 'react-dom', 'react-router-dom', 'axios', 'clsx', 'lucide-react',
    'tailwind-merge', 'zod', 'zustand'
  ].map((name) => [name, '^1.0.0']));
  const devDependencies = Object.fromEntries([
    '@eslint/js', '@types/node', '@types/react', '@types/react-dom', '@vitejs/plugin-react',
    'eslint', 'eslint-plugin-react-hooks', 'eslint-plugin-react-refresh', 'typescript', 'vite'
  ].map((name) => [name, '^1.0.0']));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'vingrade-frontend', dependencies, devDependencies
  }));

  const manifest = await discoverProject(root);
  const node = manifest.projects[0];

  assert.deepEqual(node.dependencySummary, {
    status: 'parsed',
    declarationCount: 19,
    uniqueCount: 19,
    duplicateCount: 0,
    byType: {
      dependencies: 9,
      devDependencies: 10,
      peerDependencies: 0,
      optionalDependencies: 0
    }
  });
  assert.equal(node.dependencies.length, 19);
});

test('Node detects a package declared across dependency sections', async (t) => {
  const root = await temporaryProject(t, 'upgradelens-node-duplicate-');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'node-duplicate',
    dependencies: { shared: '^1.0.0' },
    devDependencies: { shared: '^2.0.0' },
    peerDependencies: { peer: '^3.0.0' },
    optionalDependencies: { optional: '^4.0.0' }
  }));

  const manifest = await discoverProject(root);
  const node = manifest.projects[0];

  assert.equal(node.dependencySummary.declarationCount, 4);
  assert.equal(node.dependencySummary.uniqueCount, 3);
  assert.equal(node.dependencySummary.duplicateCount, 1);
  assert.equal(node.dependencies.length, 4);
  assert.deepEqual(manifest.warnings, [{
    code: 'DUPLICATE_DEPENDENCY_DECLARATION',
    path: 'package.json',
    message: 'Dependency shared is declared multiple times.'
  }]);
});

test('dependency inventories are deterministic and manifest paths are relative', async (t) => {
  const root = await projectWithRequirements(
    t,
    'Zulu==1\nalpha==2\nBravo==3\nalpha>=1\n',
    'services/api/requirements.txt'
  );

  const first = await discoverProject(root, { clock: () => new Date('2026-01-01T00:00:00.000Z') });
  const second = await discoverProject(root, { clock: () => new Date('2026-01-01T00:00:00.000Z') });
  const dependencies = first.projects[0].dependencies;

  assert.deepEqual(first, second);
  assert.deepEqual(dependencies.map((dependency) => dependency.normalizedName), ['alpha', 'alpha', 'bravo', 'zulu']);
  assert.ok(dependencies.every((dependency) => dependency.manifest === 'services/api/requirements.txt'));
  assert.equal(first.projects[0].dependencySummary.duplicateCount,
    first.projects[0].dependencySummary.declarationCount - first.projects[0].dependencySummary.uniqueCount);
});
