import { spawn } from 'node:child_process';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FORBIDDEN_CAPTURE_PREFIXES = Object.freeze([
  'package/docs/rr-02-cli-captures/',
  'package/docs/rr02-fix-01-cli-captures/',
  'package/docs/rr02-fix-02-cli-captures/',
  'package/docs/rr02-rerun-cli-captures/',
  'package/docs/rr02-fix-03-cli-captures/',
  'package/docs/rr02-fix-03a-cli-captures/'
]);

export const REQUIRED_PACKAGE_PATHS = Object.freeze([
  'package/LICENSE',
  'package/README.md',
  'package/bin/upgradelens.js',
  'package/docs/IA-04-CLI-Orchestration.md',
  'package/docs/cli-progress.md',
  'package/docs/migration-planning-qualification-resolution.md',
  'package/docs/package-content-policy.md',
  'package/eval/migration-planning/golden-dataset-v2.json',
  'package/eval/migration-planning/golden-dataset.json',
  'package/package.json',
  'package/schemas/migration-checklist-extractive-candidate.schema.json',
  'package/schemas/migration-planning-qualification-record.schema.json',
  'package/src/cli.js',
  'package/src/index.js',
  'package/src/orchestration/progress-events.js'
]);

const CAPTURE_DIRECTORY_PATTERN = /^package\/docs\/[^/]*-cli-captures(?:\/|$)/i;
const CAPTURE_HELPER_PATTERN =
  /^package\/(?:scripts|tools)\/(?=[^/]*(?:rr|cli))(?=[^/]*capture)[^/]*\.(?:[cm]?js|py|sh)$/i;
const MAX_REPORTED_PATHS = 10;

export class PackageContentGuardError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'PackageContentGuardError';
    this.code = 'PACKAGE_CONTENT_GUARD_FAILED';
    this.details = details;
  }
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function normalizeTarPath(value) {
  const portable = String(value).replaceAll('\\', '/').replace(/^\.\/+/, '');
  return path.posix.normalize(`/${portable}`).slice(1).replace(/\/+$/, '');
}

export function stablePackagePaths(values) {
  return [...new Set(values.map(normalizeTarPath).filter(Boolean))].sort(compareText);
}

export function isForbiddenPackagePath(value) {
  const packagePath = normalizeTarPath(value);
  return CAPTURE_DIRECTORY_PATTERN.test(packagePath)
    || CAPTURE_HELPER_PATTERN.test(packagePath);
}

function tarText(buffer, start, length) {
  const end = buffer.indexOf(0, start);
  const boundedEnd = end === -1 || end > start + length ? start + length : end;
  return buffer.subarray(start, boundedEnd).toString('utf8').trim();
}

function tarSize(buffer, offset) {
  const value = tarText(buffer, offset + 124, 12).replace(/\0/g, '').trim();
  if (value.length === 0) return 0;
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PackageContentGuardError('npm tarball contains an invalid entry size.', {
      forbidden: [],
      missing: []
    });
  }
  return parsed;
}

export function readTarGzipEntries(bytes) {
  const archive = gunzipSync(bytes);
  const entries = [];
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = tarText(header, 0, 100);
    const prefix = tarText(header, 345, 155);
    const entryPath = prefix ? `${prefix}/${name}` : name;
    if (entryPath) entries.push(entryPath);
    const size = tarSize(archive, offset);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return stablePackagePaths(entries);
}

export function validatePackageEntries(entries, {
  requiredPaths = REQUIRED_PACKAGE_PATHS
} = {}) {
  const normalized = stablePackagePaths(entries);
  const available = new Set(normalized);
  const forbidden = normalized.filter(isForbiddenPackagePath);
  const missing = stablePackagePaths(requiredPaths).filter((value) => !available.has(value));
  return Object.freeze({
    entries: Object.freeze(normalized),
    forbidden: Object.freeze(forbidden),
    missing: Object.freeze(missing)
  });
}

function boundedPaths(values) {
  const shown = values.slice(0, MAX_REPORTED_PATHS).map((value) => `  - ${value}`);
  if (values.length > MAX_REPORTED_PATHS) {
    shown.push(`  - ... and ${values.length - MAX_REPORTED_PATHS} more`);
  }
  return shown.join('\n');
}

export function assertPackageEntries(entries, options) {
  const result = validatePackageEntries(entries, options);
  if (result.forbidden.length === 0 && result.missing.length === 0) return result;

  const sections = ['npm package content guard failed.'];
  if (result.forbidden.length > 0) {
    sections.push(
      `Forbidden capture evidence (${result.forbidden.length}):`,
      boundedPaths(result.forbidden)
    );
  }
  if (result.missing.length > 0) {
    sections.push(
      `Missing required package assets (${result.missing.length}):`,
      boundedPaths(result.missing)
    );
  }
  throw new PackageContentGuardError(sections.join('\n'), {
    forbidden: result.forbidden,
    missing: result.missing
  });
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      const result = {
        code,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      };
      if (code === 0) resolve(result);
      else {
        const detail = result.stderr.trim().split('\n').slice(-3).join(' ');
        reject(new Error(
          `npm pack exited with code ${code ?? 'null'} (${signal ?? 'no signal'}).`
          + (detail ? ` ${detail}` : '')
        ));
      }
    });
  });
}

export async function inspectNpmPackage({
  repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm',
  temporaryRoot
} = {}) {
  const workRoot = temporaryRoot
    ?? await mkdtemp(path.join(os.tmpdir(), 'upgradelens-package-content-'));
  const packRoot = path.join(workRoot, 'pack');
  const cacheRoot = path.join(workRoot, 'npm-cache');
  try {
    await mkdir(packRoot, { recursive: true });
    const result = await run(npmCommand, [
      'pack',
      '--json',
      '--pack-destination',
      packRoot
    ], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        npm_config_cache: cacheRoot
      }
    });
    let metadata;
    try {
      metadata = JSON.parse(result.stdout)?.[0];
    } catch {
      throw new Error('npm pack did not return valid JSON metadata.');
    }
    if (!metadata?.filename) throw new Error('npm pack metadata did not contain a filename.');
    const tarball = await readFile(path.join(packRoot, metadata.filename));
    const entries = readTarGzipEntries(tarball);
    const validation = assertPackageEntries(entries);
    return Object.freeze({
      name: metadata.name,
      version: metadata.version,
      filename: metadata.filename,
      size: metadata.size,
      unpackedSize: metadata.unpackedSize,
      shasum: metadata.shasum,
      integrity: metadata.integrity,
      entryCount: entries.length,
      validation
    });
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

async function main() {
  const result = await inspectNpmPackage();
  process.stdout.write(
    `Package content guard passed: ${result.name}@${result.version}, `
    + `${result.entryCount} files, 0 capture evidence, `
    + `${REQUIRED_PACKAGE_PATHS.length} required assets present.\n`
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
