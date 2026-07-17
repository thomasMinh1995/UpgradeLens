import assert from 'node:assert/strict';
import { access, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  FORBIDDEN_CAPTURE_PREFIXES,
  REQUIRED_PACKAGE_PATHS,
  PackageContentGuardError,
  assertPackageEntries,
  inspectNpmPackage,
  isForbiddenPackagePath,
  normalizeTarPath,
  stablePackagePaths,
  validatePackageEntries
} from '../scripts/package-content-guard.mjs';

test('capture contract recognizes all six exact trees and the future naming convention', () => {
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

test('path-aware rules preserve user-facing Markdown and unrelated assets', () => {
  for (const value of [
    'package/docs/RR02-FIX-03-npm-Capture-Evidence-Exclusion.md',
    'package/docs/cli-progress.md',
    'package/docs/example/final-screen.png',
    'package/docs/example/manifest.json',
    'package/src/cli.js'
  ]) {
    assert.equal(isForbiddenPackagePath(value), false, value);
  }
});

test('normalization and ordering are stable and POSIX-safe', () => {
  assert.equal(normalizeTarPath('./package\\src\\index.js'), 'package/src/index.js');
  assert.deepEqual(stablePackagePaths([
    'package/z',
    './package/a',
    'package/z',
    'package/m/'
  ]), ['package/a', 'package/m', 'package/z']);
});

test('validation identifies forbidden evidence and missing required assets independently', () => {
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
});

test('guard failure is actionable, stable-sorted, and bounded', () => {
  const entries = Array.from({ length: 12 }, (_, index) => (
    `package/docs/rr99-cli-captures/${String(12 - index).padStart(2, '0')}/metadata.json`
  ));
  assert.throws(
    () => assertPackageEntries(entries, { requiredPaths: [] }),
    (error) => {
      assert.ok(error instanceof PackageContentGuardError);
      assert.equal(error.details.forbidden.length, 12);
      assert.match(error.message, /Forbidden capture evidence \(12\)/);
      assert.match(error.message, /\.\.\. and 2 more/);
      assert.ok(
        error.message.indexOf('/01/metadata.json') < error.message.indexOf('/10/metadata.json')
      );
      assert.doesNotMatch(error.message, /\/11\/metadata\.json/);
      return true;
    }
  );
});

test('authoritative required list covers runtime, schemas, datasets, and user docs', () => {
  for (const value of [
    'package/bin/upgradelens.js',
    'package/src/index.js',
    'package/schemas/migration-planning-qualification-record.schema.json',
    'package/schemas/migration-checklist-extractive-candidate.schema.json',
    'package/eval/migration-planning/golden-dataset-v2.json',
    'package/docs/cli-progress.md',
    'package/docs/migration-planning-qualification-resolution.md',
    'package/docs/package-content-policy.md'
  ]) {
    assert.ok(REQUIRED_PACKAGE_PATHS.includes(value), value);
  }
});

test('actual npm tarball passes offline content checks and temporary state is cleaned', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-guard-test-'));
  const result = await inspectNpmPackage({
    repositoryRoot: path.resolve(new URL('..', import.meta.url).pathname),
    temporaryRoot
  });
  assert.equal(result.validation.forbidden.length, 0);
  assert.equal(result.validation.missing.length, 0);
  assert.equal(result.entryCount > 0, true);
  await assert.rejects(access(temporaryRoot), { code: 'ENOENT' });
});
