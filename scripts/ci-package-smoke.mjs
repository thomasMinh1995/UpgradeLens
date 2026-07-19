import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  assertPackageEntries,
  readTarGzipEntries,
  resolveGitPackageState
} from './package-content-guard.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const expectedVersion = '0.5.0';
const expectedPublicExports = 438;
const providerEnvironmentKeys = [
  'UPGRADELENS_AI_PROVIDER',
  'UPGRADELENS_AI_ENDPOINT',
  'UPGRADELENS_AI_MODEL',
  'UPGRADELENS_AI_AUTHORIZATION',
  'UPGRADELENS_AI_TIMEOUT_MS',
  'UPGRADELENS_AI_TIMEOUT_SECONDS',
  'UPGRADELENS_AI_MAX_RESPONSE_BYTES',
  'UPGRADELENS_AI_DEBUG'
];

function cleanEnvironment(cacheRoot) {
  const env = {
    ...process.env,
    CI: 'true'
  };
  if (cacheRoot) env.npm_config_cache = cacheRoot;
  for (const key of providerEnvironmentKeys) delete env[key];
  return env;
}

async function runChecked(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      ...options,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 5 * 60 * 1000
    });
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? '')
      .trim()
      .split('\n')
      .slice(-5)
      .join(' ');
    throw new Error(
      `${command} failed with exit code ${error?.code ?? 'unknown'}.`
      + (detail ? ` ${detail}` : '')
    );
  }
}

async function extractedFiles(root, relative = '') {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.posix.join(relative.replaceAll(path.sep, '/'), entry.name);
    if (entry.isDirectory()) {
      files.push(...await extractedFiles(root, child));
    } else {
      files.push(child);
    }
  }
  return files.sort();
}

async function main() {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'upgradelens-ci-package-smoke-')
  );
  const packRoot = path.join(temporaryRoot, 'pack');
  const extractRoot = path.join(temporaryRoot, 'extract');
  const installRoot = path.join(temporaryRoot, 'consumer');
  const cacheRoot = path.join(temporaryRoot, 'npm-cache');
  const consumerCacheRoot = path.join(temporaryRoot, 'consumer-npm-cache');
  const packEnvironment = cleanEnvironment(cacheRoot);
  const consumerEnvironment = cleanEnvironment(consumerCacheRoot);

  try {
    await Promise.all([
      mkdir(packRoot, { recursive: true }),
      mkdir(extractRoot, { recursive: true }),
      mkdir(installRoot, { recursive: true })
    ]);

    const packed = await runChecked(npmCommand, [
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      packRoot
    ], {
      cwd: repositoryRoot,
      env: packEnvironment
    });
    const metadata = JSON.parse(packed.stdout)?.[0];
    assert.equal(metadata?.name, 'upgradelens');
    assert.equal(metadata?.version, expectedVersion);
    assert.equal(typeof metadata?.filename, 'string');

    const tarballPath = path.join(packRoot, metadata.filename);
    const archive = await readFile(tarballPath);
    const packageEntries = readTarGzipEntries(archive);
    const gitState = await resolveGitPackageState({ repositoryRoot });
    const validation = assertPackageEntries(packageEntries, { gitState });

    await runChecked('tar', ['-xzf', tarballPath, '-C', extractRoot], {
      env: packEnvironment
    });
    const extracted = await extractedFiles(extractRoot);
    assert.deepEqual(extracted, packageEntries);
    assert.equal(
      JSON.parse(
        await readFile(path.join(extractRoot, 'package/package.json'), 'utf8')
      ).version,
      expectedVersion
    );

    await writeFile(
      path.join(installRoot, 'package.json'),
      '{"name":"upgradelens-package-smoke","private":true,"type":"module"}\n'
    );
    await runChecked(npmCommand, [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      tarballPath
    ], {
      cwd: installRoot,
      env: consumerEnvironment
    });

    const installedCli = path.join(
      installRoot,
      'node_modules',
      'upgradelens',
      'bin',
      'upgradelens.js'
    );
    const version = await runChecked(process.execPath, [installedCli, '--version'], {
      cwd: installRoot,
      env: consumerEnvironment
    });
    assert.equal(version.stdout.trim(), expectedVersion);

    const help = await runChecked(process.execPath, [installedCli, '--help'], {
      cwd: installRoot,
      env: consumerEnvironment
    });
    assert.match(help.stdout, /UpgradeLens/);
    assert.match(help.stdout, /analyze/);

    const imported = await runChecked(process.execPath, [
      '--input-type=module',
      '--eval',
      "const api = await import('upgradelens'); console.log(Object.keys(api).length);"
    ], {
      cwd: installRoot,
      env: consumerEnvironment
    });
    assert.equal(Number(imported.stdout.trim()), expectedPublicExports);

    process.stdout.write(
      `Package smoke passed: ${metadata.name}@${metadata.version}, `
      + `${packageEntries.length} extracted files, `
      + `${validation.summary.requiredAssetCount} required assets, `
      + `${expectedPublicExports} public exports.\n`
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
