import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  FORBIDDEN_CAPTURE_PREFIXES,
  PACKAGE_GUARD_REASON_CODES,
  PROTECTED_PACKAGE_PREFIXES,
  REQUIRED_PACKAGE_PATHS,
  PackageContentGuardError,
  assertPackageEntries,
  forbiddenPackageReason,
  inspectNpmPackage,
  isForbiddenPackagePath,
  isProtectedPackagePath,
  normalizeTarPath,
  renderPackageGuardFailure,
  runPackageGuardCli,
  stablePackagePaths,
  suspiciousPackageFilenameReason,
  validatePackageEntries
} from '../scripts/package-content-guard.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function availableGit({ tracked = [], untracked = [] } = {}) {
  return {
    status: 'available',
    trackedPaths: tracked,
    untrackedPaths: untracked
  };
}

test('capture contract recognizes exact trees and the future naming convention', () => {
  for (const prefix of FORBIDDEN_CAPTURE_PREFIXES) {
    assert.equal(isForbiddenPackagePath(`${prefix}manifest.json`), true);
    assert.equal(isForbiddenPackagePath(`${prefix}001/final-screen.png`), true);
  }
  assert.equal(
    isForbiddenPackagePath('package/docs/rr99-fix-01-cli-captures/001/transcript.raw.txt'),
    true
  );
  assert.equal(
    isForbiddenPackagePath('package/scripts/rr99-cli-capture-helper.mjs'),
    true
  );
});

test('protected implementation areas follow the published package structure', () => {
  assert.deepEqual(PROTECTED_PACKAGE_PREFIXES, [
    'package/bin/',
    'package/eval/datasets/',
    'package/eval/migration-planning/',
    'package/eval/schemas/',
    'package/schemas/',
    'package/src/'
  ]);
  for (const value of [
    'package/bin/upgradelens.js',
    'package/src/index.js',
    'package/schemas/upgrade-decision.schema.json',
    'package/eval/datasets/node/react-major-breaking.json',
    'package/eval/migration-planning/golden-dataset-v2.json',
    'package/eval/schemas/golden-case.schema.json'
  ]) {
    assert.equal(isProtectedPackagePath(value), true, value);
  }
  for (const value of [
    'package/docs/mp-r02-architecture.md',
    'package/test/fixture-2fa.json',
    'package/package.json'
  ]) {
    assert.equal(isProtectedPackagePath(value), false, value);
  }
});

test('OSS-01 numeric, parenthesized, copy, and backup names are rejected', () => {
  const cases = [
    ['package/src/runtime 2.js', 'SUSPICIOUS_NUMERIC_COPY_SUFFIX'],
    ['package/src/runtime 3.js', 'SUSPICIOUS_NUMERIC_COPY_SUFFIX'],
    ['package/schemas/example 2.schema.json', 'SUSPICIOUS_NUMERIC_COPY_SUFFIX'],
    ['package/schemas/example 3.schema.json', 'SUSPICIOUS_NUMERIC_COPY_SUFFIX'],
    ['package/src/runtime (2).js', 'SUSPICIOUS_PARENTHESIZED_COPY_SUFFIX'],
    ['package/src/runtime (3).test.js', 'SUSPICIOUS_PARENTHESIZED_COPY_SUFFIX'],
    ['package/src/runtime copy.js', 'SUSPICIOUS_COPY_NAME'],
    ['package/src/runtime-copy.js', 'SUSPICIOUS_COPY_NAME'],
    ['package/src/runtime_duplicate.js', 'SUSPICIOUS_COPY_NAME'],
    ['package/src/runtime.js.bak', 'SUSPICIOUS_BACKUP_SUFFIX'],
    ['package/src/runtime.js.orig', 'SUSPICIOUS_BACKUP_SUFFIX'],
    ['package/src/runtime.js.save', 'SUSPICIOUS_BACKUP_SUFFIX'],
    ['package/src/runtime.js.tmp', 'SUSPICIOUS_BACKUP_SUFFIX'],
    ['package/src/runtime.js~', 'SUSPICIOUS_BACKUP_SUFFIX']
  ];
  for (const [entry, code] of cases) {
    assert.equal(suspiciousPackageFilenameReason(entry), code, entry);
    const result = validatePackageEntries([entry], { requiredPaths: [] });
    assert.deepEqual(result.violations.map((item) => item.code), [code], entry);
  }
});

test('valid numeric identities and intentional documentation do not false-positive', () => {
  for (const entry of [
    'package/src/sha256.js',
    'package/src/oauth2.js',
    'package/src/v2-runtime.js',
    'package/src/mp-r02-policy.js',
    'package/schemas/migration-checklist-v2.schema.json',
    'package/schemas/contract-v2.json',
    'package/eval/datasets/fixture-2fa.json',
    'package/docs/python3.md',
    'package/docs/mp-r02-architecture.md',
    'package/docs/ts-fix-01-exact-duplicate-occurrence-target-selection-architecture.md',
    'package/test/fixture-2fa.json'
  ]) {
    assert.equal(suspiciousPackageFilenameReason(entry), null, entry);
  }
});

test('portable path validation rejects absolute, traversal, outside-root, and duplicate entries', () => {
  const result = validatePackageEntries([
    '/package/src/absolute.js',
    'C:\\package\\src\\drive.js',
    'package/src/../escape.js',
    'src/outside.js',
    'package/src/index.js',
    './package/src/index.js'
  ], { requiredPaths: [] });
  assert.equal(
    result.violations.filter(
      (item) => item.code === PACKAGE_GUARD_REASON_CODES.INVALID_PACKAGE_ENTRY_PATH
    ).length,
    4
  );
  assert.deepEqual(
    result.violations.filter(
      (item) => item.code === PACKAGE_GUARD_REASON_CODES.DUPLICATE_NORMALIZED_PACKAGE_ENTRY
    ).map((item) => item.path),
    ['package/src/index.js']
  );
  assert.ok(result.violations.every((item) => !item.path.startsWith('/')));
  assert.ok(result.violations.every((item) => !/^[a-z]:/iu.test(item.path)));
});

test('normalization and ordering remain stable and POSIX-safe', () => {
  assert.equal(normalizeTarPath('./package\\src\\index.js'), 'package/src/index.js');
  assert.deepEqual(stablePackagePaths([
    'package/z',
    './package/a',
    'package/z',
    'package/m/'
  ]), ['package/a', 'package/m', 'package/z']);
});

test('strict release mode rejects any packaged protected file not tracked by Git', () => {
  const entry = 'package/src/new-untracked.js';
  const result = validatePackageEntries([entry], {
    requiredPaths: [],
    gitState: availableGit({ untracked: ['src/new-untracked.js'] })
  });
  assert.deepEqual(result.violations.map((item) => item.code), [
    PACKAGE_GUARD_REASON_CODES.UNEXPECTED_PACKAGED_UNTRACKED_IMPLEMENTATION_FILE
  ]);
  assert.equal(result.git.status, 'available');
});

test('source archive mode without Git metadata preserves structural checks without crashing', () => {
  const valid = validatePackageEntries([
    'package/src/sha256.js',
    'package/schemas/contract-v2.json'
  ], {
    requiredPaths: [],
    gitState: { status: 'unavailable', reason: 'GIT_METADATA_UNAVAILABLE' }
  });
  assert.equal(valid.status, 'pass');
  assert.deepEqual(valid.git, {
    status: 'unavailable',
    reason: 'GIT_METADATA_UNAVAILABLE'
  });

  const invalid = validatePackageEntries(['package/src/runtime 2.js'], {
    requiredPaths: [],
    gitState: { status: 'unavailable', reason: 'GIT_METADATA_UNAVAILABLE' }
  });
  assert.equal(invalid.status, 'fail');
  assert.equal(
    invalid.violations[0].code,
    PACKAGE_GUARD_REASON_CODES.SUSPICIOUS_NUMERIC_COPY_SUFFIX
  );
});

test('existing exclusions cover captures, env, credentials, local, and qualification artifacts', () => {
  const cases = [
    ['package/docs/rr02-rerun-cli-captures/manifest.json', 'FORBIDDEN_CAPTURE_EVIDENCE'],
    ['package/.env', 'FORBIDDEN_ENV_FILE'],
    ['package/docs/.env.local', 'FORBIDDEN_ENV_FILE'],
    ['package/credentials.json', 'FORBIDDEN_CREDENTIAL_FILE'],
    ['package/.DS_Store', 'FORBIDDEN_LOCAL_ARTIFACT'],
    ['package/node_modules/example/index.js', 'FORBIDDEN_LOCAL_ARTIFACT'],
    ['package/.upgradelens/migration-planning-qualification.json',
      'FORBIDDEN_QUALIFICATION_ARTIFACT']
  ];
  for (const [entry, reason] of cases) {
    assert.equal(forbiddenPackageReason(entry), reason, entry);
  }
  assert.equal(
    forbiddenPackageReason(
      'package/schemas/migration-planning-qualification-record.schema.json'
    ),
    null
  );
});

test('required assets and forbidden entries fail independently', () => {
  const result = validatePackageEntries([
    'package/src/index.js',
    'package/docs/rr02-rerun-cli-captures/manifest.json'
  ], {
    requiredPaths: ['package/src/index.js', 'package/bin/upgradelens.js']
  });
  assert.deepEqual(result.forbidden, [
    'package/docs/rr02-rerun-cli-captures/manifest.json'
  ]);
  assert.deepEqual(result.missing, ['package/bin/upgradelens.js']);
  assert.deepEqual(result.violations.map((item) => item.code), [
    PACKAGE_GUARD_REASON_CODES.FORBIDDEN_CAPTURE_EVIDENCE,
    PACKAGE_GUARD_REASON_CODES.MISSING_REQUIRED_PACKAGE_ASSET
  ]);
});

test('diagnostics are reason/path sorted, bounded, content-free, and deterministic', () => {
  const entries = Array.from({ length: 12 }, (_, index) => (
    `package/src/runtime ${String(12 - index).padStart(2, '0')}.js`
  ));
  const forward = validatePackageEntries(entries, { requiredPaths: [] });
  const reversed = validatePackageEntries([...entries].reverse(), { requiredPaths: [] });
  assert.deepEqual(forward, reversed);
  const first = renderPackageGuardFailure(forward);
  const second = renderPackageGuardFailure(reversed);
  assert.equal(first, second);
  assert.match(first, /^Package guard failed\./);
  assert.match(first, /SUSPICIOUS_NUMERIC_COPY_SUFFIX \(12\)/);
  assert.match(first, /\.\.\. and 2 more/);
  assert.ok(first.indexOf('runtime 01.js') < first.indexOf('runtime 10.js'));
  assert.doesNotMatch(first, /runtime 11\.js/);
});

test('pure validation is repeatable and never mutates manifest input', () => {
  const entries = [
    'package/src/runtime 2.js',
    'package/src/sha256.js',
    'package/src/runtime.js.bak'
  ];
  const before = structuredClone(entries);
  const first = JSON.stringify(validatePackageEntries(entries, { requiredPaths: [] }));
  const second = JSON.stringify(validatePackageEntries(entries, { requiredPaths: [] }));
  assert.equal(first, second);
  assert.deepEqual(entries, before);
});

test('assertion and CLI contracts map policy failure to non-zero without a stack trace', async () => {
  const entries = ['package/src/runtime 2.js'];
  let policyError;
  assert.throws(
    () => assertPackageEntries(entries, { requiredPaths: [] }),
    (error) => {
      assert.ok(error instanceof PackageContentGuardError);
      assert.equal(error.details.summary.violationCount, 1);
      assert.match(error.message, /SUSPICIOUS_NUMERIC_COPY_SUFFIX/);
      policyError = error;
      return true;
    }
  );

  let stdout = '';
  let stderr = '';
  const exitCode = await runPackageGuardCli({
    inspect: async () => {
      throw policyError;
    },
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });
  assert.equal(exitCode, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /^Package guard failed\./);
  assert.doesNotMatch(stderr, /PackageContentGuardError|at file:/);
});

test('authoritative required list covers runtime, schemas, datasets, and user docs', () => {
  for (const value of [
    'package/bin/upgradelens.js',
    'package/src/index.js',
    'package/src/migration-checklist/verification.js',
    'package/src/product-completion.js',
    'package/src/target-selector.js',
    'package/schemas/migration-checklist.schema.json',
    'package/schemas/migration-planning-qualification-record.schema.json',
    'package/schemas/migration-checklist-extractive-candidate.schema.json',
    'package/schemas/upgrade-decision.schema.json',
    'package/eval/migration-planning/golden-dataset-v2.json',
    'package/docs/cli-progress.md',
    'package/docs/migration-planning-qualification-resolution.md',
    'package/docs/package-content-policy.md'
  ]) {
    assert.ok(REQUIRED_PACKAGE_PATHS.includes(value), value);
  }
  assert.equal(REQUIRED_PACKAGE_PATHS.length, 20);
});

test('actual npm boundary includes and rejects an untracked OSS-01 numeric copy', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-guard-fixture-'));
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-guard-pack-'));
  try {
    await mkdir(path.join(fixtureRoot, 'src'));
    await writeFile(path.join(fixtureRoot, 'package.json'), `${JSON.stringify({
      name: 'guard-adversarial-fixture',
      version: '1.0.0',
      type: 'module',
      files: ['src']
    }, null, 2)}\n`);
    const canonical = 'export const runtime = true;\n';
    await writeFile(path.join(fixtureRoot, 'src/runtime.js'), canonical);
    await writeFile(path.join(fixtureRoot, 'src/runtime 2.js'), canonical);
    await execFileAsync('git', ['init', '-q'], { cwd: fixtureRoot });
    await execFileAsync('git', ['add', 'package.json', 'src/runtime.js'], {
      cwd: fixtureRoot
    });
    const before = await readFile(path.join(fixtureRoot, 'src/runtime 2.js'), 'utf8');

    await assert.rejects(
      inspectNpmPackage({
        repositoryRoot: fixtureRoot,
        temporaryRoot,
        requiredPaths: []
      }),
      (error) => {
        assert.ok(error instanceof PackageContentGuardError);
        assert.ok(error.details.entries.includes('package/src/runtime 2.js'));
        assert.deepEqual(error.details.violations.map((item) => item.code), [
          PACKAGE_GUARD_REASON_CODES.SUSPICIOUS_NUMERIC_COPY_SUFFIX,
          PACKAGE_GUARD_REASON_CODES.UNEXPECTED_PACKAGED_UNTRACKED_IMPLEMENTATION_FILE
        ]);
        return true;
      }
    );

    assert.equal(
      await readFile(path.join(fixtureRoot, 'src/runtime 2.js'), 'utf8'),
      before
    );
    await access(path.join(fixtureRoot, 'src/runtime 2.js'));
    await assert.rejects(access(temporaryRoot), { code: 'ENOENT' });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('actual source-archive package without Git metadata passes structural policy', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-archive-fixture-'));
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-archive-pack-'));
  try {
    await mkdir(path.join(fixtureRoot, 'src'));
    await mkdir(path.join(fixtureRoot, 'schemas'));
    await writeFile(path.join(fixtureRoot, 'package.json'), `${JSON.stringify({
      name: 'guard-source-archive-fixture',
      version: '1.0.0',
      type: 'module',
      files: ['src', 'schemas']
    }, null, 2)}\n`);
    await writeFile(path.join(fixtureRoot, 'src/sha256.js'), 'export const sha256 = true;\n');
    await writeFile(
      path.join(fixtureRoot, 'schemas/contract-v2.json'),
      '{"version":"v2"}\n'
    );

    const result = await inspectNpmPackage({
      repositoryRoot: fixtureRoot,
      temporaryRoot,
      requiredPaths: []
    });
    assert.equal(result.validation.status, 'pass');
    assert.deepEqual(result.validation.git, {
      status: 'unavailable',
      reason: 'GIT_METADATA_UNAVAILABLE'
    });
    assert.equal(result.validation.summary.suspiciousArtifactCount, 0);
    await assert.rejects(access(temporaryRoot), { code: 'ENOENT' });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('actual current npm tarball passes strict Git-correlated content checks', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-guard-test-'));
  const result = await inspectNpmPackage({
    repositoryRoot,
    temporaryRoot
  });
  assert.equal(result.validation.status, 'pass');
  assert.equal(result.validation.summary.suspiciousArtifactCount, 0);
  assert.equal(result.validation.summary.requiredAssetCount, REQUIRED_PACKAGE_PATHS.length);
  assert.equal(result.validation.git.status, 'available');
  assert.equal(result.entryCount > 0, true);
  await assert.rejects(access(temporaryRoot), { code: 'ENOENT' });
});

test('package scripts have no pack/install recursion or consumer lifecycle hook', async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')
  );
  assert.equal(packageJson.scripts['check:package'], 'node scripts/package-content-guard.mjs');
  for (const hook of [
    'prepack',
    'prepare',
    'prepublishOnly',
    'preinstall',
    'install',
    'postinstall'
  ]) {
    assert.equal(packageJson.scripts[hook], undefined, hook);
  }
});
