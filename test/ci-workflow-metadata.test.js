import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const workflowPath = path.join(repositoryRoot, '.github/workflows/ci.yml');
const smokePath = path.join(repositoryRoot, 'scripts/ci-package-smoke.mjs');

async function workflowText() {
  return readFile(workflowPath, 'utf8');
}

test('CI triggers pull requests and intended long-lived branches only', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /^on:\n/m);
  assert.match(workflow, /^  pull_request:\n/m);
  assert.match(workflow, /^  push:\n    branches:\n      - main\n      - develop\n/m);
  assert.match(workflow, /^  workflow_dispatch:\n/m);
  assert.doesNotMatch(workflow, /pull_request_target/);
});

test('CI permissions, checkout, concurrency, and timeout are bounded', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(workflow, /^\s+[a-z-]+: write\s*$/m);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.match(
    workflow,
    /group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/
  );
  assert.match(workflow, /cancel-in-progress: true/);
  assert.equal((workflow.match(/timeout-minutes: 20/g) ?? []).length, 2);
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 2);
});

test('CI uses immutable official actions and the supported LTS matrix', async () => {
  const workflow = await workflowText();
  assert.equal(
    (
      workflow.match(
        /actions\/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6/g
      ) ?? []
    ).length,
    2
  );
  assert.equal(
    (
      workflow.match(
        /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6/g
      ) ?? []
    ).length,
    2
  );
  assert.match(workflow, /node:\n          - 20\n          - 22\n          - 24/);
  assert.match(workflow, /node-version: 24/);
  assert.equal((workflow.match(/cache: npm/g) ?? []).length, 2);
});

test('CI replays canonical install, test, guard, and package smoke commands', async () => {
  const workflow = await workflowText();
  assert.equal((workflow.match(/run: npm ci/g) ?? []).length, 2);
  assert.match(workflow, /if: matrix\.node == 20\n        run: npm test -- --test-concurrency=2/);
  assert.match(workflow, /if: matrix\.node != 20\n        run: npm test/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run check:package/);
  assert.match(workflow, /run: npm pack --dry-run --json --ignore-scripts/);
  assert.match(workflow, /run: node scripts\/ci-package-smoke\.mjs/);
  await access(smokePath);
});

test('CI has no publication, release, push, writeback, or provider secret dependency', async () => {
  const workflow = await workflowText();
  for (const prohibited of [
    /\bnpm publish\b/,
    /\bgh release\b/,
    /\bgit tag\b/,
    /\bgit push\b/,
    /\bgit commit\b/,
    /upload-artifact/,
    /id-token:\s*write/,
    /packages:\s*write/
  ]) {
    assert.doesNotMatch(workflow, prohibited);
  }
  for (const key of [
    'UPGRADELENS_AI_PROVIDER',
    'UPGRADELENS_AI_ENDPOINT',
    'UPGRADELENS_AI_MODEL',
    'UPGRADELENS_AI_AUTHORIZATION'
  ]) {
    assert.match(workflow, new RegExp(`^  ${key}: \"\"$`, 'm'));
  }
});

test('npm metadata matches the UpgradeLens Technical Preview contract', async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')
  );
  const lockfile = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8')
  );

  assert.equal(packageJson.name, 'upgradelens');
  assert.equal(packageJson.version, '0.5.0');
  assert.equal(
    packageJson.description,
    'Decision-first CLI for evidence-bounded dependency upgrade analysis.'
  );
  assert.deepEqual(packageJson.repository, {
    type: 'git',
    url: 'git+https://github.com/thomasMinh1995/UpgradeLens.git'
  });
  assert.equal(
    packageJson.homepage,
    'https://github.com/thomasMinh1995/UpgradeLens#readme'
  );
  assert.deepEqual(packageJson.bugs, {
    url: 'https://github.com/thomasMinh1995/UpgradeLens/issues'
  });
  assert.deepEqual(packageJson.keywords, [
    'cli',
    'dependency-upgrades',
    'migration-planning',
    'repository-analysis',
    'developer-tools'
  ]);
  assert.deepEqual(packageJson.engines, { node: '>=20' });
  assert.equal(lockfile.version, '0.5.0');
  assert.equal(lockfile.packages[''].version, '0.5.0');
});
